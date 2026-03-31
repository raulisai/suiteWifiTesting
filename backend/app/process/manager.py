import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timezone


@dataclass
class ActiveProcess:
    attack_id: str
    attack_type: str
    bssid: str | None
    process: asyncio.subprocess.Process
    started_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    status: str = "running"   # "running" | "done" | "stopped" | "failed"


class ProcessManager:
    """Singleton registry of all currently running attack processes.

    Keeps track of spawned subprocesses so they can be cancelled on demand
    or cleaned up on application shutdown.
    """

    _instance: "ProcessManager | None" = None
    _processes: dict[str, ActiveProcess]

    def __new__(cls) -> "ProcessManager":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._processes = {}
        return cls._instance

    def register(
        self,
        attack_id: str,
        process: asyncio.subprocess.Process,
        attack_type: str,
        bssid: str | None = None,
    ) -> ActiveProcess:
        """Register a new active process.

        Returns:
            The created ``ActiveProcess`` record.
        """
        entry = ActiveProcess(
            attack_id=attack_id,
            attack_type=attack_type,
            bssid=bssid,
            process=process,
        )
        self._processes[attack_id] = entry
        return entry

    def get(self, attack_id: str) -> ActiveProcess | None:
        """Return the ActiveProcess for *attack_id*, or None."""
        return self._processes.get(attack_id)

    def list_active(self) -> list[ActiveProcess]:
        """Return all processes currently in *running* state."""
        return [p for p in self._processes.values() if p.status == "running"]

    async def kill(self, attack_id: str) -> bool:
        """Terminate the process for *attack_id*.

        Returns:
            True if the process was found and terminated, False otherwise.
        """
        entry = self._processes.get(attack_id)
        if entry is None:
            return False
        try:
            entry.process.terminate()
            await asyncio.wait_for(entry.process.wait(), timeout=5)
        except (ProcessLookupError, asyncio.TimeoutError):
            try:
                entry.process.kill()
            except ProcessLookupError:
                pass
        entry.status = "stopped"
        return True

    async def kill_all(self) -> None:
        """Terminate all running processes. Called on application shutdown."""
        for attack_id in list(self._processes):
            await self.kill(attack_id)

    def mark_done(self, attack_id: str, status: str = "done") -> None:
        """Update status for a completed process."""
        entry = self._processes.get(attack_id)
        if entry:
            entry.status = status


# Module-level singleton
process_manager = ProcessManager()
