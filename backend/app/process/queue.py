import asyncio
from collections.abc import Callable, Coroutine
from dataclasses import dataclass, field
from typing import Any

from app.core.config import settings


@dataclass
class AttackJob:
    """Represents a queued attack task."""

    attack_id: str
    coroutine_factory: Callable[[], Coroutine[Any, Any, None]]
    priority: int = 0  # lower = higher priority (reserved for future use)
    _task: asyncio.Task | None = field(default=None, init=False, repr=False)


class AttackQueue:
    """Async queue that limits concurrent attack executions.

    Enforces ``MAX_CONCURRENT_ATTACKS`` from settings.
    Jobs are processed in FIFO order using asyncio.Queue.
    """

    def __init__(self, max_concurrent: int | None = None) -> None:
        self._max = max_concurrent or settings.max_concurrent_attacks
        self._semaphore = asyncio.Semaphore(self._max)
        self._queue: asyncio.Queue[AttackJob] = asyncio.Queue()
        self._running: dict[str, asyncio.Task] = {}
        self._worker_task: asyncio.Task | None = None

    async def start(self) -> None:
        """Start the background worker loop."""
        self._worker_task = asyncio.create_task(self._worker())

    async def stop(self) -> None:
        """Stop the worker and cancel all running tasks."""
        if self._worker_task:
            self._worker_task.cancel()
        for task in self._running.values():
            task.cancel()

    async def enqueue(self, job: AttackJob) -> None:
        """Add an attack job to the queue."""
        await self._queue.put(job)

    async def _worker(self) -> None:
        """Process jobs from the queue, respecting the concurrency limit."""
        while True:
            job = await self._queue.get()
            await self._semaphore.acquire()
            task = asyncio.create_task(self._run_job(job))
            self._running[job.attack_id] = task

    async def _run_job(self, job: AttackJob) -> None:
        try:
            await job.coroutine_factory()
        finally:
            self._semaphore.release()
            self._running.pop(job.attack_id, None)

    @property
    def queue_size(self) -> int:
        return self._queue.qsize()

    @property
    def active_count(self) -> int:
        return len(self._running)


# Module-level singleton
attack_queue = AttackQueue()
