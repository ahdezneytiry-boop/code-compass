import { loadNotes, saveNotes } from './storage.js';

const form = document.querySelector('#note-form');
const input = document.querySelector('#idea');
const list = document.querySelector('#notes');
let notes = loadNotes();

// 把每条想法变成页面上的一张便签。
function renderNotes() {
  list.replaceChildren();
  for (const idea of notes) {
    const card = document.createElement('p');
    card.textContent = idea;
    list.append(card);
  }
}

// 提交时保存文字，再重新显示便签。
form.addEventListener('submit', (event) => {
  event.preventDefault();
  const idea = input.value.trim();
  if (!idea) return;
  notes.push(idea);
  saveNotes(notes);
  renderNotes();
  input.value = '';
});

renderNotes();
