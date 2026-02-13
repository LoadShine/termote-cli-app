function toTimestamp(input: string | number): number {
    return typeof input === 'string' ? new Date(input).getTime() : input;
}

export function formatDuration(timestamp: string | number): string {
    const now = Date.now();
    const diff = now - toTimestamp(timestamp);
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
        return `${days}d ${hours % 24}h`;
    } else if (hours > 0) {
        return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
        return `${minutes}m`;
    } else {
        return `${seconds}s`;
    }
}

export function formatDate(timestamp: string | number) {
    return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(new Date(toTimestamp(timestamp)));
}

export function formatId(id: string) {
    return id.slice(0, 8) + '...';
}