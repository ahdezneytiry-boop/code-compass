const storageKey = 'idea-notes';

// 从当前浏览器读取以前保存的便签。
export function loadNotes() {
  const saved = localStorage.getItem(storageKey);
  try {
    const notes = JSON.parse(saved || '[]');
    return Array.isArray(notes) ? notes.filter(value => typeof value === 'string') : [];
  } catch {
    return [];
  }
}

// 将便签列表转成文字，存到当前浏览器。
export function saveNotes(notes) {
  localStorage.setItem(storageKey, JSON.stringify(notes));
}
