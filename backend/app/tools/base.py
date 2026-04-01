import asyncio
import logging
import shutil
from collections.abc import AsyncIterator

logger = logging.getLogger(__name__)


class ToolTimeout(Exception):
    """Raised when a tool execution exceeds its timeout."""
    pass


class ToolError(Exception):
    """Raised when a tool execution fails."""
    def __init__(self, message: str, returncode: int | None = None, stderr: str = ""):
        super().__init__(message)
        self.returncode = returncode
        self.stderr = stderr


class AsyncToolWrapper:
    """Base class for all external tool wrappers.

    Subclasses must set the ``binary`` class attribute to the executable name.
    """

    binary: str = ""
    default_timeout: int = 300  # 5 minutes default

    def is_available(self) -> bool:
        """Return True if the binary is found on PATH."""
        return shutil.which(self.binary) is not None

    def get_binary_path(self) -> str | None:
        """Return the full path to the binary, or None if not found."""
        return shutil.which(self.binary)

    async def run(
        self,
        args: list[str],
        stdin: str | None = None,
        timeout: int | None = None,
    ) -> tuple[int, str, str]:
        """Run the tool and wait for completion.

        Args:
            args: Command-line arguments.
            stdin: Optional input to send to stdin.
            timeout: Timeout in seconds (uses default_timeout if not specified).

        Returns:
            Tuple of (return_code, stdout, stderr).

        Raises:
            ToolTimeout: If execution exceeds the timeout.
        """
        effective_timeout = timeout if timeout is not None else self.default_timeout

        proc = await asyncio.create_subprocess_exec(
            self.binary,
            *args,
            stdin=asyncio.subprocess.PIPE if stdin else None,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        try:
            stdout_bytes, stderr_bytes = await asyncio.wait_for(
                proc.communicate(input=stdin.encode() if stdin else None),
                timeout=effective_timeout,
            )
            return (
                proc.returncode or 0,
                stdout_bytes.decode(errors="replace"),
                stderr_bytes.decode(errors="replace"),
            )
        except asyncio.TimeoutError:
            logger.warning(f"{self.binary} timed out after {effective_timeout}s")
            try:
                proc.terminate()
                await asyncio.wait_for(proc.wait(), timeout=5)
            except (ProcessLookupError, asyncio.TimeoutError):
                try:
                    proc.kill()
                except ProcessLookupError:
                    pass
            raise ToolTimeout(f"{self.binary} execution timed out after {effective_timeout}s")

    async def run_with_retry(
        self,
        args: list[str],
        stdin: str | None = None,
        timeout: int | None = None,
        max_retries: int = 3,
        retry_delay: float = 2.0,
    ) -> tuple[int, str, str]:
        """Run the tool with automatic retry on failure.

        Args:
            args: Command-line arguments.
            stdin: Optional input to send to stdin.
            timeout: Timeout in seconds per attempt.
            max_retries: Maximum number of retry attempts.
            retry_delay: Delay in seconds between retries.

        Returns:
            Tuple of (return_code, stdout, stderr).

        Raises:
            ToolError: If all retries fail.
            ToolTimeout: If execution times out on all attempts.
        """
        last_error: Exception | None = None

        for attempt in range(max_retries):
            try:
                rc, stdout, stderr = await self.run(args, stdin, timeout)
                if rc == 0:
                    return rc, stdout, stderr
                # Non-zero exit code, but might be retryable
                last_error = ToolError(
                    f"{self.binary} returned non-zero exit code: {rc}",
                    returncode=rc,
                    stderr=stderr,
                )
            except ToolTimeout as e:
                last_error = e
            except Exception as e:
                last_error = e

            if attempt < max_retries - 1:
                logger.info(f"{self.binary} attempt {attempt + 1} failed, retrying in {retry_delay}s...")
                await asyncio.sleep(retry_delay)

        if last_error:
            raise last_error
        raise ToolError(f"{self.binary} failed after {max_retries} attempts")

    async def stream(
        self,
        args: list[str],
        merge_stderr: bool = False,
        timeout: int | None = None,
    ) -> AsyncIterator[str]:
        """Run the tool and yield each output line in real time.

        Args:
            args: Command-line arguments.
            merge_stderr: If True, stderr lines are yielded alongside stdout.
            timeout: Optional timeout in seconds for the entire operation.

        Yields:
            Decoded text lines (without trailing newline).

        Note:
            If timeout is specified and exceeded, the process will be terminated
            and a final line indicating the timeout will be yielded.
        """
        stderr_dest = asyncio.subprocess.STDOUT if merge_stderr else asyncio.subprocess.PIPE
        effective_timeout = timeout if timeout is not None else self.default_timeout

        # Use DEVNULL for stdin to prevent tools from waiting for input
        proc = await asyncio.create_subprocess_exec(
            self.binary,
            *args,
            stdin=asyncio.subprocess.DEVNULL,
            stdout=asyncio.subprocess.PIPE,
            stderr=stderr_dest,
        )

        assert proc.stdout is not None

        start_time = asyncio.get_event_loop().time()

        try:
            async for raw_line in proc.stdout:
                # Check timeout
                if asyncio.get_event_loop().time() - start_time > effective_timeout:
                    logger.warning(f"{self.binary} stream timed out after {effective_timeout}s")
                    proc.terminate()
                    yield f"[TIMEOUT] {self.binary} exceeded {effective_timeout}s limit"
                    break
                yield raw_line.decode(errors="replace").rstrip()
        finally:
            # Ensure process is cleaned up
            if proc.returncode is None:
                try:
                    proc.terminate()
                    await asyncio.wait_for(proc.wait(), timeout=5)
                except (ProcessLookupError, asyncio.TimeoutError):
                    try:
                        proc.kill()
                    except ProcessLookupError:
                        pass

    async def get_version(self) -> str | None:
        """Try to retrieve a version string from the tool.

        Falls back to ``--version`` flag; returns None if unavailable.
        """
        for flag in ("--version", "-version", "-V"):
            try:
                rc, stdout, stderr = await self.run([flag])
                output = (stdout + stderr).strip()
                if output:
                    # Return first non-empty line
                    first_line = next((l for l in output.splitlines() if l.strip()), None)
                    return first_line
            except Exception:
                continue
        return None
