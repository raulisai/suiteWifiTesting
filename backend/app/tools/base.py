import asyncio
import shutil
from collections.abc import AsyncIterator


class AsyncToolWrapper:
    """Base class for all external tool wrappers.

    Subclasses must set the ``binary`` class attribute to the executable name.
    """

    binary: str = ""

    def is_available(self) -> bool:
        """Return True if the binary is found on PATH."""
        return shutil.which(self.binary) is not None

    async def run(
        self,
        args: list[str],
        stdin: str | None = None,
    ) -> tuple[int, str, str]:
        """Run the tool and wait for completion.

        Returns:
            Tuple of (return_code, stdout, stderr).
        """
        proc = await asyncio.create_subprocess_exec(
            self.binary,
            *args,
            stdin=asyncio.subprocess.PIPE if stdin else None,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout_bytes, stderr_bytes = await proc.communicate(
            input=stdin.encode() if stdin else None
        )
        return (
            proc.returncode or 0,
            stdout_bytes.decode(errors="replace"),
            stderr_bytes.decode(errors="replace"),
        )

    async def stream(
        self,
        args: list[str],
        merge_stderr: bool = False,
    ) -> AsyncIterator[str]:
        """Run the tool and yield each output line in real time.

        Args:
            args: Command-line arguments.
            merge_stderr: If True, stderr lines are yielded alongside stdout.

        Yields:
            Decoded text lines (without trailing newline).
        """
        stderr_dest = asyncio.subprocess.STDOUT if merge_stderr else asyncio.subprocess.PIPE

        proc = await asyncio.create_subprocess_exec(
            self.binary,
            *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=stderr_dest,
        )

        assert proc.stdout is not None

        async for raw_line in proc.stdout:
            yield raw_line.decode(errors="replace").rstrip()

        await proc.wait()

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
