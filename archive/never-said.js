/* ═══════════════════════════════════════════════════
   THINGS I NEVER SAID OUT LOUD — Chapter IV Controller v4
   Card Carousel, Scroll List Toggle, Reply Sheet & Persistence
   ═══════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  initDeckNavigation();
  initViewSwitcher();
  initReplyModal();
  initObservations();
  initQuestions();
});

let currentCardIdx = 0;
const totalCards = 12;

function initDeckNavigation() {
  const container = document.getElementById('cardsContainer');
  const btnPrev = document.getElementById('btnPrevCard');
  const btnNext = document.getElementById('btnNextCard');
  const counter = document.getElementById('chapterCounter');
  const cards = document.querySelectorAll('.story-card');

  if (!container || cards.length === 0) return;

  function updateDeckState() {
    if (counter) {
      const numStr = (currentCardIdx + 1).toString().padStart(2, '0');
      counter.textContent = `Chapter ${numStr} / ${totalCards}`;
    }
    if (btnPrev) btnPrev.disabled = currentCardIdx === 0;
    if (btnNext) btnNext.disabled = currentCardIdx === cards.length - 1;

    // Scroll card into view
    const targetCard = cards[currentCardIdx];
    if (targetCard) {
      targetCard.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }

  if (btnPrev) {
    btnPrev.addEventListener('click', () => {
      if (currentCardIdx > 0) {
        currentCardIdx--;
        updateDeckState();
      }
    });
  }

  if (btnNext) {
    btnNext.addEventListener('click', () => {
      if (currentCardIdx < cards.length - 1) {
        currentCardIdx++;
        updateDeckState();
      }
    });
  }

  // Keyboard Navigation
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') {
      if (currentCardIdx < cards.length - 1) {
        currentCardIdx++;
        updateDeckState();
      }
    } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
      if (currentCardIdx > 0) {
        currentCardIdx--;
        updateDeckState();
      }
    }
  });

  // Scroll Sync Listener
  container.addEventListener('scroll', () => {
    const scrollPos = container.scrollLeft;
    const cardWidth = cards[0].offsetWidth + 24;
    const newIdx = Math.round(scrollPos / cardWidth);
    if (newIdx !== currentCardIdx && newIdx >= 0 && newIdx < cards.length) {
      currentCardIdx = newIdx;
      if (counter) {
        const numStr = (currentCardIdx + 1).toString().padStart(2, '0');
        counter.textContent = `Chapter ${numStr} / ${totalCards}`;
      }
      if (btnPrev) btnPrev.disabled = currentCardIdx === 0;
      if (btnNext) btnNext.disabled = currentCardIdx === cards.length - 1;
    }
  });
}

// View Switcher (Deck vs Scroll List)
function initViewSwitcher() {
  const tabDeck = document.getElementById('tabDeckView');
  const tabList = document.getElementById('tabListView');
  const deckWrap = document.getElementById('deckWrap');
  const listWrap = document.getElementById('listWrap');
  const cardsContainer = document.getElementById('cardsContainer');

  if (!tabDeck || !tabList || !deckWrap || !listWrap) return;

  tabDeck.addEventListener('click', () => {
    tabDeck.classList.add('active');
    tabList.classList.remove('active');
    deckWrap.style.display = 'block';
    listWrap.style.display = 'none';
  });

  tabList.addEventListener('click', () => {
    tabList.classList.add('active');
    tabDeck.classList.remove('active');
    deckWrap.style.display = 'none';
    listWrap.style.display = 'flex';

    // Populate vertical list view if empty
    if (listWrap.children.length === 0 && cardsContainer) {
      const cards = cardsContainer.querySelectorAll('.story-card');
      cards.forEach(card => {
        const clone = card.cloneNode(true);
        clone.classList.remove('story-card');
        clone.classList.add('editorial-item');
        listWrap.appendChild(clone);
      });
      // Re-attach reply button handlers in list view
      listWrap.querySelectorAll('.btn-reply-glass').forEach(btn => {
        btn.addEventListener('click', () => {
          const replyTarget = btn.dataset.reply || 'Chapter';
          openReplyModal(replyTarget);
        });
      });
    }
  });
}

// Modal Reply Sheet Logic
let currentReplyTarget = '';

function openReplyModal(targetName) {
  const modal = document.getElementById('replyModal');
  const title = document.getElementById('replyModalTitle');
  const textarea = document.getElementById('replyInput');

  currentReplyTarget = targetName;
  if (title) title.textContent = `Reply: ${targetName}`;
  if (textarea) textarea.value = '';
  if (modal) modal.classList.add('open');
}

function initReplyModal() {
  const modal = document.getElementById('replyModal');
  const btnClose = document.getElementById('btnCloseModal');
  const btnSend = document.getElementById('btnSendReply');
  const textarea = document.getElementById('replyInput');

  document.querySelectorAll('.btn-reply-glass').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.reply || 'Chapter';
      openReplyModal(target);
    });
  });

  if (btnClose && modal) {
    btnClose.addEventListener('click', () => modal.classList.remove('open'));
  }

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('open');
    });
  }

  if (btnSend && textarea && modal) {
    btnSend.addEventListener('click', async () => {
      const text = textarea.value.trim();
      if (!text) return;

      btnSend.disabled = true;
      btnSend.textContent = 'Sending...';

      try {
        await fetch('/api/responses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            replies: [{ target: currentReplyTarget, text, date: new Date().toISOString() }]
          })
        });
      } catch (err) {
        console.warn('Backend save issue:', err);
      }

      // Save locally as fallback
      const localReplies = JSON.parse(localStorage.getItem('chapter_replies') || '[]');
      localReplies.push({ target: currentReplyTarget, text, date: new Date().toISOString() });
      localStorage.setItem('chapter_replies', JSON.stringify(localReplies));

      btnSend.disabled = false;
      btnSend.textContent = 'Sent! ❤️';
      setTimeout(() => {
        modal.classList.remove('open');
        btnSend.textContent = 'Send Reply';
      }, 1000);
    });
  }
}

// Observation Buttons
function initObservations() {
  document.querySelectorAll('.btn-obs-choice').forEach(btn => {
    btn.addEventListener('click', () => {
      const group = btn.parentElement;
      group.querySelectorAll('.btn-obs-choice').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const obsId = btn.dataset.obs;
      const val = btn.dataset.val;

      fetch('/api/responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ choices: { [`obs_${obsId}`]: val } })
      }).catch(e => console.warn(e));
    });
  });
}

// Question Answers
function initQuestions() {
  const btnSave = document.getElementById('btnSaveQuestions');
  if (!btnSave) return;

  btnSave.addEventListener('click', async () => {
    const q1 = document.getElementById('qInput1')?.value.trim();
    const q2 = document.getElementById('qInput2')?.value.trim();

    btnSave.disabled = true;
    btnSave.textContent = 'Saving...';

    try {
      await fetch('/api/responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions: { q1, q2, timestamp: new Date().toISOString() } })
      });
    } catch (e) {
      console.warn(e);
    }

    btnSave.disabled = false;
    btnSave.textContent = 'Saved! ✨';
    setTimeout(() => { btnSave.textContent = 'Save Answers'; }, 2000);
  });
}
