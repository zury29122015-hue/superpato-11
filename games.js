// ============================================================
// Built-in mini-games. Each function receives a container DOM
// element and a `onScore(n)` callback to track plays.
// ============================================================

const BuiltInGames = {

  // ---------- SNAKE ----------
  snake(container, onScore) {
    container.innerHTML = `
      <div class="game-area">
        <h3>🐍 Snake</h3>
        <div class="score">Puntos: <span id="snake-score">0</span></div>
        <canvas id="snake-canvas" width="400" height="400"></canvas>
        <p class="hint">Usa las flechas del teclado para moverte.</p>
      </div>
    `;
    const canvas = container.querySelector('#snake-canvas');
    const ctx = canvas.getContext('2d');
    const scoreEl = container.querySelector('#snake-score');
    const cell = 20;
    const cols = canvas.width / cell;
    let snake = [{ x: 10, y: 10 }];
    let dir = { x: 1, y: 0 };
    let food = { x: 5, y: 5 };
    let score = 0;
    let running = true;

    const keyHandler = (e) => {
      const k = e.key;
      if (k === 'ArrowUp' && dir.y !== 1) dir = { x: 0, y: -1 };
      if (k === 'ArrowDown' && dir.y !== -1) dir = { x: 0, y: 1 };
      if (k === 'ArrowLeft' && dir.x !== 1) dir = { x: -1, y: 0 };
      if (k === 'ArrowRight' && dir.x !== -1) dir = { x: 1, y: 0 };
    };
    document.addEventListener('keydown', keyHandler);

    const tick = () => {
      if (!running) return;
      const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
      if (head.x < 0 || head.x >= cols || head.y < 0 || head.y >= cols ||
          snake.some(s => s.x === head.x && s.y === head.y)) {
        running = false;
        ctx.fillStyle = 'rgba(0,0,0,.7)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 28px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Game Over', canvas.width / 2, canvas.height / 2);
        onScore && onScore(score);
        return;
      }
      snake.unshift(head);
      if (head.x === food.x && head.y === food.y) {
        score += 10;
        scoreEl.textContent = score;
        food = { x: Math.floor(Math.random() * cols), y: Math.floor(Math.random() * cols) };
      } else {
        snake.pop();
      }
      ctx.fillStyle = '#0f1525';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#ff4d6d';
      ctx.fillRect(food.x * cell, food.y * cell, cell - 2, cell - 2);
      ctx.fillStyle = '#7c5cff';
      snake.forEach((s, i) => {
        ctx.fillStyle = i === 0 ? '#00e0c7' : '#7c5cff';
        ctx.fillRect(s.x * cell, s.y * cell, cell - 2, cell - 2);
      });
      setTimeout(tick, 120);
    };
    tick();

    return () => {
      running = false;
      document.removeEventListener('keydown', keyHandler);
    };
  },

  // ---------- TIC TAC TOE ----------
  tictactoe(container, onScore) {
    container.innerHTML = `
      <div class="game-area">
        <h3>⭕ Tic Tac Toe</h3>
        <div class="score" id="ttt-status">Tu turno (X)</div>
        <div class="ttt-board" id="ttt-board"></div>
        <button class="btn ghost" id="ttt-reset">Reiniciar</button>
      </div>
    `;
    const board = container.querySelector('#ttt-board');
    const status = container.querySelector('#ttt-status');
    let cells = Array(9).fill('');
    let turn = 'X';
    let done = false;

    const wins = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    const checkWin = (p) => wins.some(line => line.every(i => cells[i] === p));

    const render = () => {
      board.innerHTML = '';
      cells.forEach((c, i) => {
        const b = document.createElement('button');
        b.className = 'ttt-cell';
        b.textContent = c;
        b.onclick = () => {
          if (done || cells[i] || turn !== 'X') return;
          cells[i] = 'X';
          if (checkWin('X')) { status.textContent = '¡Ganaste! 🎉'; done = true; onScore && onScore(20); render(); return; }
          if (cells.every(c => c)) { status.textContent = 'Empate'; done = true; render(); return; }
          turn = 'O';
          status.textContent = 'Pensando...';
          render();
          setTimeout(cpuMove, 400);
        };
        board.appendChild(b);
      });
    };

    const cpuMove = () => {
      if (done) return;
      const empty = cells.map((c, i) => c ? null : i).filter(i => i !== null);
      // Try to win, then block, then random
      const tryMove = (p) => {
        for (const i of empty) {
          cells[i] = p;
          if (checkWin(p)) { cells[i] = ''; return i; }
          cells[i] = '';
        }
        return null;
      };
      let move = tryMove('O') ?? tryMove('X') ?? empty[Math.floor(Math.random() * empty.length)];
      cells[move] = 'O';
      if (checkWin('O')) { status.textContent = 'Perdiste. 😢'; done = true; render(); return; }
      if (cells.every(c => c)) { status.textContent = 'Empate'; done = true; render(); return; }
      turn = 'X';
      status.textContent = 'Tu turno (X)';
      render();
    };

    container.querySelector('#ttt-reset').onclick = () => {
      cells = Array(9).fill(''); turn = 'X'; done = false;
      status.textContent = 'Tu turno (X)';
      render();
    };

    render();
    return () => {};
  },

  // ---------- MEMORY ----------
  memory(container, onScore) {
    const emojis = ['🍎','🚀','⭐','🎵','⚡','🌈','🐱','🍩'];
    let deck = [...emojis, ...emojis].sort(() => Math.random() - 0.5);
    let flipped = [];
    let matched = 0;
    let moves = 0;

    container.innerHTML = `
      <div class="game-area">
        <h3>🧠 Memoria</h3>
        <div class="score">Movimientos: <span id="mem-moves">0</span> · Parejas: <span id="mem-matched">0</span>/8</div>
        <div class="memory-board" id="mem-board"></div>
      </div>
    `;
    const board = container.querySelector('#mem-board');
    const movesEl = container.querySelector('#mem-moves');
    const matchedEl = container.querySelector('#mem-matched');

    deck.forEach((emoji, i) => {
      const b = document.createElement('button');
      b.className = 'mem-card';
      b.dataset.emoji = emoji;
      b.dataset.index = i;
      b.textContent = emoji;
      b.onclick = () => {
        if (b.classList.contains('flipped') || b.classList.contains('matched') || flipped.length === 2) return;
        b.classList.add('flipped');
        flipped.push(b);
        if (flipped.length === 2) {
          moves++;
          movesEl.textContent = moves;
          if (flipped[0].dataset.emoji === flipped[1].dataset.emoji) {
            flipped.forEach(c => c.classList.add('matched'));
            matched++;
            matchedEl.textContent = matched;
            flipped = [];
            if (matched === 8) {
              onScore && onScore(Math.max(50 - moves, 10));
              setTimeout(() => alert('¡Completado en ' + moves + ' movimientos!'), 200);
            }
          } else {
            setTimeout(() => {
              flipped.forEach(c => c.classList.remove('flipped'));
              flipped = [];
            }, 700);
          }
        }
      };
      board.appendChild(b);
    });

    return () => {};
  },

  // ---------- CLICKER ----------
  clicker(container, onScore) {
    let count = 0;
    let cps = 0;
    let lastClicks = [];

    container.innerHTML = `
      <div class="game-area">
        <h3>👆 Clicker</h3>
        <div class="score">Clicks: <span id="clk-count">0</span> · CPS: <span id="clk-cps">0</span></div>
        <button class="clicker-btn" id="clk-btn">👆</button>
        <p class="hint">¡Haz clic lo más rápido que puedas!</p>
      </div>
    `;

    const btn = container.querySelector('#clk-btn');
    const countEl = container.querySelector('#clk-count');
    const cpsEl = container.querySelector('#clk-cps');
    const emojis = ['🎉','✨','⚡','💥','🔥','⭐'];

    btn.onclick = () => {
      count++;
      countEl.textContent = count;
      btn.textContent = emojis[count % emojis.length];
      lastClicks.push(Date.now());
      lastClicks = lastClicks.filter(t => Date.now() - t < 1000);
      cps = lastClicks.length;
      cpsEl.textContent = cps;
      if (count === 50 || count === 100 || count === 200) onScore && onScore(count);
    };

    const interval = setInterval(() => {
      lastClicks = lastClicks.filter(t => Date.now() - t < 1000);
      cpsEl.textContent = lastClicks.length;
    }, 200);

    return () => clearInterval(interval);
  }
};
