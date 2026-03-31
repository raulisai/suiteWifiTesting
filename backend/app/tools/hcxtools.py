import os
from collections.abc import AsyncIterator

from app.tools.base import AsyncToolWrapper


class HcxTool(AsyncToolWrapper):
    """Wrapper for hcxdumptool + hcxpcapngtool (PMKID capture & conversion)."""

    binary = "hcxdumptool"

    async def capture_pmkid(
        self,
        interface: str,
        output_file: str,
        bssid_filter: str | None = None,
        timeout: int = 120,
    ) -> AsyncIterator[str]:
        """Capture PMKID hashes using hcxdumptool.

        Args:
            interface: Monitor-mode interface.
            output_file: Path where the .pcapng capture is saved.
            bssid_filter: Optional BSSID to filter (only attack this AP).
            timeout: Max capture time in seconds (0 = run until killed).

        Yields:
            Output lines from hcxdumptool.
        """
        args = [
            "-i", interface,
            "-o", output_file,
            "--enable_status=3",
        ]

        if bssid_filter:
            # Write filter file next to the output
            filter_path = output_file + ".filter"
            with open(filter_path, "w") as f:
                f.write(bssid_filter.replace(":", "").upper() + "\n")
            args += ["--filterlist_ap=" + filter_path, "--filtermode=2"]

        if timeout > 0:
            args = ["timeout", str(timeout)] + [self.binary] + args
            import asyncio
            proc = await asyncio.create_subprocess_exec(
                *args,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
            )
            assert proc.stdout is not None
            async for raw_line in proc.stdout:
                yield raw_line.decode(errors="replace").rstrip()
            await proc.wait()
        else:
            async for line in self.stream(args[1:], merge_stderr=True):  # skip timeout prefix
                yield line

    async def convert_to_hashcat(
        self,
        pcapng_file: str,
        output_file: str,
        bssid_filter: str | None = None,
    ) -> tuple[int, str]:
        """Convert a .pcapng capture to Hashcat mode 22000 format.

        Args:
            pcapng_file: Input .pcapng file.
            output_file: Output .hc22000 file.
            bssid_filter: Optional BSSID filter.

        Returns:
            Tuple of (return_code, combined_output).
        """
        args = ["-o", output_file]

        if bssid_filter:
            filter_path = pcapng_file + ".mac_filter"
            with open(filter_path, "w") as f:
                f.write(bssid_filter + "\n")
            args += ["--filterlist_ap=" + filter_path]

        args.append(pcapng_file)

        # hcxpcapngtool is a different binary
        import asyncio
        import shutil
        pcapngtool = shutil.which("hcxpcapngtool")
        if not pcapngtool:
            return 1, "hcxpcapngtool not found"

        proc = await asyncio.create_subprocess_exec(
            pcapngtool,
            *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout_bytes, stderr_bytes = await proc.communicate()
        combined = stdout_bytes.decode(errors="replace") + stderr_bytes.decode(errors="replace")
        return proc.returncode or 0, combined

    def has_pmkid(self, output: str) -> bool:
        """Check whether the tool output contains a PMKID capture."""
        return "FOUND PMKID" in output.upper()
