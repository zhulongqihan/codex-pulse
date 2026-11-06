import React from 'react';
import { compact, exact } from './utils.js';

const format = (n) =>
  n.toLocaleString('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
const price = (n) =>
  Number.isFinite(n)
    ? '$' +
      n.toLocaleString('en-US', {
        maximumFractionDigits: n > 0 && n < 0.01 ? 6 : 2,
        minimumFractionDigits: 2,
      })
    : '—';
function ceiling(value) {
  if (!(value > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(value));
  return [1, 2, 2.5, 5, 10].find((v) => v * p >= value) * p;
}

export function MeterPlot({ rows, allDays, selected, onSelect, view }) {
  const cost = view === 'cost';
  const scale = ceiling(
    Math.max(
      cost ? 0.01 : 0.00001,
      ...rows.map((r) =>
        cost ? (Number.isFinite(r.cost) ? r.cost : 0) : r.total,
      ),
    ),
  );
  const axis = (value) => (cost ? price(value) : compact(value * 1e6));
  function move(event, index) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? rows.length - 1
          : Math.max(
              0,
              Math.min(
                rows.length - 1,
                index + (event.key === 'ArrowRight' ? 1 : -1),
              ),
            );
    onSelect(allDays.indexOf(rows[next]));
    event.currentTarget.parentElement.querySelectorAll('button')[next]?.focus();
  }
  return (
    <div className="meter-chart">
      <div className="meter-scale" aria-hidden="true">
        <span>{axis(scale)}</span>
        <span>{axis(scale / 2)}</span>
        <span>0</span>
      </div>
      <div
        className="meter-tallies"
        style={{ gridTemplateColumns: `repeat(${rows.length},minmax(0,1fr))` }}
        role="group"
        aria-label="选择日期"
      >
        <svg
          className="meter-guides"
          viewBox="0 0 100 150"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d="M0 .5H100M0 75H100M0 149.5H100" />
        </svg>
        {rows.map((r, index) => {
          const ix = allDays.indexOf(r),
            active = selected === ix;
          const segments = [
            ['uncached', r.input - r.cache],
            ['cached', r.cache],
            ['output', r.output],
          ];
          return (
            <button
              key={r.date}
              className="meter-day"
              aria-pressed={active}
              aria-label={`${r.date.slice(5).replace('-', '/')} ${r.day} ${cost ? 'API estimate ' + price(r.cost) : compact(r.total * 1e6) + ' tokens'}`}
              onClick={() => onSelect(ix)}
              onKeyDown={(e) => move(e, index)}
            >
              <span className="meter-value">
                {cost ? price(r.cost) : compact(r.total * 1e6)}
              </span>
              <span
                className="meter-bar"
                role="img"
                aria-label={
                  cost
                    ? `API estimate ${price(r.cost)}; not a Pro bill`
                    : r.hasTokenBreakdown === false
                      ? `Total ${exact(r.total * 1e6)} tokens`
                      : `Input ${exact(r.input * 1e6)}, cache ${exact(r.cache * 1e6)}, output ${exact(r.output * 1e6)}`
                }
              >
                <span className="meter-stack">
                  {cost ? (
                    <i
                      className="cost-column"
                      style={{
                        height: Number.isFinite(r.cost)
                          ? (r.cost / scale) * 100 + '%'
                          : '0%',
                      }}
                    />
                  ) : r.hasTokenBreakdown === false ? (
                    <i
                      className="cost-column"
                      style={{ height: (r.total / scale) * 100 + '%' }}
                    />
                  ) : (
                    segments.map(([name, value]) => (
                      <i
                        key={name}
                        className={name}
                        style={{
                          height: (Math.max(0, value) / scale) * 100 + '%',
                        }}
                      />
                    ))
                  )}
                </span>
              </span>
              <span className="meter-date">
                <strong>{r.date.slice(5).replace('-', '/')}</strong>
                <small>{r.day}</small>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function StylePreview({ variant }) {
  const values = [16.2, 18.3, 20.1, 21.1, 23.6, 17.8, 24.8];
  return (
    <div className={'style-preview preview-' + variant} aria-hidden="true">
      <div className="preview-chrome">
        <span />
        <i />
        <i />
        <i />
        <i />
      </div>
      <div className="preview-body">
        <div className="preview-main">
          <div className="preview-totals">
            <strong>141.9</strong>
            <i />
            <i />
            <i />
          </div>
          <div className="preview-chart">
            {values.map((v, i) => (
              <span
                key={i}
                style={
                  variant === 'meter'
                    ? { height: (v / 25) * 100 + '%' }
                    : { width: (v / 25) * 100 + '%' }
                }
              >
                <i />
                <i />
                <i />
              </span>
            ))}
          </div>
          <div className="preview-list">
            <i />
            <i />
            <i />
          </div>
        </div>
        <div className="preview-aside">
          <strong>
            68<span>%</span>
          </strong>
          <i />
          <i />
          <i />
        </div>
      </div>
    </div>
  );
}
