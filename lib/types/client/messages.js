/** Text blocks of a message (ContentBlock text parts under either key). */
function messageText(data) {
    if (typeof data !== 'object' || data === null)
        return '';
    const record = data;
    const content = Array.isArray(record.content)
        ? record.content
        : typeof record.message === 'object' && record.message !== null
            ? record.message.content
            : undefined;
    if (!Array.isArray(content))
        return '';
    return content
        .filter((block) => typeof block === 'object' && block !== null)
        .filter((block) => block.type === 'text' && typeof block.text === 'string')
        .map(block => block.text)
        .join('');
}
/**
 * Extract user/assistant text rows from a history page, in log order. Empty
 * text rows are dropped.
 * @param entries - pulled history entries, or undefined while none are loaded.
 * @returns the ordered text rows.
 */
export function taskMessageRows(entries) {
    if (entries === undefined)
        return [];
    const rows = [];
    for (const entry of entries) {
        if (entry.event.type === 'user/message') {
            const text = messageText(entry.event.data);
            if (text !== '')
                rows.push({ role: 'user', text });
        }
        else if (entry.event.type === 'assistant/message') {
            const text = messageText(entry.event.data);
            if (text !== '')
                rows.push({ role: 'assistant', text });
        }
    }
    return rows;
}
//# sourceMappingURL=messages.js.map