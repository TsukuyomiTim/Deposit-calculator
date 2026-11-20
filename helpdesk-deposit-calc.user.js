// ==UserScript==
// @name         HelpDesk Deposit Calculator
// @namespace    http://tampermonkey.net/
// @version      1.4
// @description  Плавающее окошко для расчёта (депозиты - выводы) / депозиты * 100. Created by Plover
// @author       Plover
// @match        https://app.helpdesk.com/*
// @match        *://*.boadmin.org/*
// @match        *://boadmin.org/*
// @updateURL    https://github.com/TsukuyomiTim/Deposit-calculator/raw/refs/heads/main/helpdesk-deposit-calc.user.js
// @downloadURL  https://github.com/TsukuyomiTim/Deposit-calculator/raw/refs/heads/main/helpdesk-deposit-calc.user.js
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const STORAGE_KEY = 'hd_deposit_calc_pos';
    const PIN_KEY = 'hd_deposit_calc_pinned';

    // ---------- утилиты ----------
    function parseNumber(str) {
        if (!str) return null;
        let cleaned = str
            .replace(/\u00A0/g, ' ')
            .replace(/\s+/g, '')
            .replace(/,/g, '.')
            .replace(/[^\d.-]/g, '');
        const num = parseFloat(cleaned);
        return isNaN(num) ? null : num;
    }

    function extractValue(text, label) {
        const regex = new RegExp(
            label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
            '[\\s\\S]*?([\\d\\s.,\\u00A0-]+)\\s*EUR',
            'i'
        );
        const match = text.match(regex);
        if (!match) return null;
        return parseNumber(match[1]);
    }

    function savePosition() {
        if (!panel) return;
        const rect = panel.getBoundingClientRect();
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            left: rect.left,
            top: rect.top
        }));
    }

    function loadPosition() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (e) {
            return null;
        }
    }

    // ---------- создание UI ----------
    let panel, isPinned = false, isDragging = false, offsetX = 0, offsetY = 0;

    function createPanel() {
        if (document.getElementById('hd-deposit-calc')) return;

        // восстанавливаем пин
        try {
            isPinned = localStorage.getItem(PIN_KEY) === '1';
        } catch (e) {}

        panel = document.createElement('div');
        panel.id = 'hd-deposit-calc';
        if (isPinned) panel.classList.add('pinned');

        panel.innerHTML = `
            <div class="hd-header">
                <span class="hd-title">Деп / Вывод</span>
                <div class="hd-controls">
                    <button id="hd-pin" title="Закрепить">📌</button>
                    <button id="hd-close" title="Скрыть">×</button>
                </div>
            </div>
            <div class="hd-body">
                <button id="hd-calc-btn">Рассчитать</button>
                <div id="hd-result" class="hd-result"></div>
                <textarea id="hd-reply" rows="3" readonly placeholder="Готовый ответ появится здесь..."></textarea>
                <button id="hd-copy" style="display:none">Скопировать ответ</button>
            </div>
            <div class="hd-footer">Created by Plover</div>
        `;

        const style = document.createElement('style');
        style.textContent = `
            #hd-deposit-calc {
                position: fixed;
                top: 120px;
                right: 30px;
                width: 280px;
                background: #1e1e2e;
                color: #cdd6f4;
                border-radius: 12px;
                box-shadow: 0 8px 32px rgba(0,0,0,0.45);
                z-index: 999999;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                font-size: 13px;
                user-select: none;
                overflow: hidden;
                border: 1px solid #313244;
            }
            #hd-deposit-calc .hd-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 8px 12px;
                background: #181825;
                cursor: move;
                border-bottom: 1px solid #313244;
            }
            #hd-deposit-calc .hd-title {
                font-weight: 600;
                font-size: 13px;
            }
            #hd-deposit-calc .hd-controls button {
                background: transparent;
                border: none;
                color: #a6adc8;
                font-size: 16px;
                cursor: pointer;
                padding: 2px 6px;
                border-radius: 4px;
            }
            #hd-deposit-calc .hd-controls button:hover {
                background: #313244;
                color: #cdd6f4;
            }
            #hd-deposit-calc .hd-body {
                padding: 12px;
            }
            #hd-calc-btn, #hd-copy {
                width: 100%;
                padding: 8px;
                border: none;
                border-radius: 8px;
                background: #89b4fa;
                color: #1e1e2e;
                font-weight: 600;
                cursor: pointer;
                margin-bottom: 10px;
            }
            #hd-calc-btn:hover, #hd-copy:hover {
                background: #b4befe;
            }
            #hd-result {
                margin-bottom: 10px;
                line-height: 1.45;
                min-height: 40px;
            }
            #hd-reply {
                width: 100%;
                box-sizing: border-box;
                background: #11111b;
                border: 1px solid #313244;
                border-radius: 8px;
                color: #cdd6f4;
                padding: 8px;
                resize: vertical;
                font-size: 12px;
                margin-bottom: 8px;
            }
            #hd-deposit-calc .hd-footer {
                text-align: center;
                font-size: 10px;
                color: #6c7086;
                padding: 4px 8px 6px;
                border-top: 1px solid #313244;
                background: #181825;
            }
            #hd-deposit-calc.pinned .hd-header {
                cursor: default;
            }
            #hd-deposit-calc.pinned #hd-pin {
                color: #a6e3a1;
            }
        `;
        document.head.appendChild(style);
        document.body.appendChild(panel);

        // восстановить позицию
        const saved = loadPosition();
        if (saved && typeof saved.left === 'number' && typeof saved.top === 'number') {
            panel.style.left = Math.max(0, saved.left) + 'px';
            panel.style.top = Math.max(0, saved.top) + 'px';
            panel.style.right = 'auto';
        }

        // события
        document.getElementById('hd-calc-btn').addEventListener('click', calculate);
        document.getElementById('hd-copy').addEventListener('click', () => {
            const percent = panel.dataset.percent || '';
            const textToCopy = `Инаут ${percent}%`;
            navigator.clipboard.writeText(textToCopy).then(() => {
                const btn = document.getElementById('hd-copy');
                btn.textContent = 'Скопировано!';
                setTimeout(() => btn.textContent = 'Скопировать ответ', 1500);
            }).catch(() => {
                const ta = document.createElement('textarea');
                ta.value = textToCopy;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                const btn = document.getElementById('hd-copy');
                btn.textContent = 'Скопировано!';
                setTimeout(() => btn.textContent = 'Скопировать ответ', 1500);
            });
        });
        document.getElementById('hd-close').addEventListener('click', () => {
            panel.style.display = 'none';
        });
        document.getElementById('hd-pin').addEventListener('click', () => {
            isPinned = !isPinned;
            panel.classList.toggle('pinned', isPinned);
            try {
                localStorage.setItem(PIN_KEY, isPinned ? '1' : '0');
            } catch (e) {}
            if (isPinned) savePosition();
        });

        const header = panel.querySelector('.hd-header');
        header.addEventListener('mousedown', startDrag);
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', stopDrag);
    }

    function startDrag(e) {
        if (isPinned) return;
        isDragging = true;
        offsetX = e.clientX - panel.getBoundingClientRect().left;
        offsetY = e.clientY - panel.getBoundingClientRect().top;
        e.preventDefault();
    }
    function drag(e) {
        if (!isDragging) return;
        panel.style.left = (e.clientX - offsetX) + 'px';
        panel.style.top = (e.clientY - offsetY) + 'px';
        panel.style.right = 'auto';
    }
    function stopDrag() {
        if (isDragging) {
            isDragging = false;
            savePosition();
        }
    }

    // ---------- расчёт ----------
    function calculate() {
        const resultEl = document.getElementById('hd-result');
        const replyEl = document.getElementById('hd-reply');
        const copyBtn = document.getElementById('hd-copy');

        const pageText = document.body.innerText || '';

        const deposits = extractValue(pageText, 'Депозиты через платежную систему');
        const withdrawals = extractValue(pageText, 'Выводы через платежные системы');

        if (deposits === null || withdrawals === null) {
            resultEl.innerHTML = `
                <span style="color:#f38ba8">Не найдено</span><br>
                Депозиты: ${deposits ?? '—'}<br>
                Выводы: ${withdrawals ?? '—'}
            `;
            replyEl.value = '';
            copyBtn.style.display = 'none';
            return;
        }

        const x = deposits - withdrawals;
        const percent = deposits === 0 ? 0 : (x / deposits) * 100;

        resultEl.innerHTML = `
            <div>Депозиты: <b>${deposits.toLocaleString('ru-RU')} EUR</b></div>
            <div>Выводы: <b>${withdrawals.toLocaleString('ru-RU')} EUR</b></div>
            <div>Разница (x): <b>${x.toLocaleString('ru-RU')} EUR</b></div>
            <div style="margin-top:6px;font-size:15px;color:#a6e3a1">
                Результат: <b>${percent.toFixed(2)}%</b>
            </div>
        `;

        const percentStr = percent.toFixed(2);
        panel.dataset.percent = percentStr;

        const replyText = `Депозиты - выводы = ${x.toLocaleString('ru-RU')} EUR\n` +
                          `${x.toLocaleString('ru-RU')} / ${deposits.toLocaleString('ru-RU')} × 100 = ${percentStr}%`;

        replyEl.value = replyText;
        copyBtn.style.display = 'block';
    }

    // ---------- проверка страницы ----------
    function isHelpdeskTicket() {
        const path = location.pathname;
        // списки тикетов — не показываем окошко
        const listPages = [
            '/tickets/all',
            '/tickets/undelivered',
            '/tickets/my-open',
            '/tickets/unassigned',
            '/tickets/search'
        ];
        for (const p of listPages) {
            if (path === p || path.startsWith(p + '/')) return false;
        }
        // только конкретный тикет: /tickets/123456...
        return /^\/tickets\/.+/.test(path);
    }

    function isBoadminSummary() {
        // ....boadmin.org/ru/Users/Summary/...
        return location.hostname.endsWith('boadmin.org') &&
               /\/ru\/Users\/Summary(\/|$)/i.test(location.pathname);
    }

    function shouldShow() {
        return isHelpdeskTicket() || isBoadminSummary();
    }

    // ---------- инициализация ----------
    function removePanel() {
        const existing = document.getElementById('hd-deposit-calc');
        if (existing) existing.remove();
        panel = null;
    }

    function checkAndToggle() {
        if (shouldShow()) {
            createPanel();
        } else {
            removePanel();
        }
    }

    function init() {
        // Всегда следим за переходами (даже если сейчас список тикетов)
        const observer = new MutationObserver(() => {
            checkAndToggle();
        });
        if (document.body) {
            observer.observe(document.body, { childList: true, subtree: true });
        }

        // SPA-навигация (HelpDesk и boadmin)
        let lastUrl = location.href;
        setInterval(() => {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                checkAndToggle();
            }
        }, 500);

        // первичная проверка
        checkAndToggle();
        setTimeout(checkAndToggle, 800);
        setTimeout(checkAndToggle, 2000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

