import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import './App.css';

const API_BASE = '/api';

const ROLE_PAGES = {
  user: ['Make Request'],
  admin: ['Overall', 'Approval Request', 'Analytics'],
  dev_user: ['Make Request', 'Overall', 'Approval Request', 'Analytics'],
};

const ROLE_LABELS = {
  user: 'User',
  admin: 'Admin',
  dev_user: 'Dev User',
};

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M10 17l5-5-5-5" />
      <path d="M15 12H3" />
      <path d="M12 3h6a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3h-6" />
    </svg>
  );
}

const analyticsSeries = [
  { key: 'requests', label: 'Requests', color: '#2563eb' },
  { key: 'borrowed_units', label: 'Items checked out', color: '#7c3aed' },
  { key: 'returned_units', label: 'Items returned', color: '#059669' },
];

const itemColorPalette = [
  { accent: '#1d4ed8', tint: '#eff6ff' },
  { accent: '#7e22ce', tint: '#faf5ff' },
  { accent: '#047857', tint: '#ecfdf5' },
  { accent: '#c2410c', tint: '#fff7ed' },
  { accent: '#be123c', tint: '#fff1f2' },
  { accent: '#0e7490', tint: '#ecfeff' },
  { accent: '#4d7c0f', tint: '#f7fee7' },
  { accent: '#4338ca', tint: '#eef2ff' },
];

function getItemColor(name) {
  const hash = [...name.toLowerCase()].reduce(
    (value, character) => (value * 31 + character.charCodeAt(0)) >>> 0,
    0
  );
  return itemColorPalette[hash % itemColorPalette.length];
}

function AnalyticsCategoryBars({ data, total, unit }) {
  return (
    <div className="analytics-category-bars">
      {data.map((item) => {
        const percentage = total > 0 ? (item.value / total) * 100 : 0;
        return (
          <div className="analytics-category-row" key={item.label}>
            <div className="analytics-category-heading">
              <span><i style={{ backgroundColor: item.color }} />{item.label}</span>
              <strong>{item.value.toLocaleString()} {unit}</strong>
            </div>
            <div
              className="analytics-category-track"
              role="img"
              aria-label={`${item.label}: ${item.value} ${unit}, ${percentage.toFixed(1)}%`}
            >
              <span
                style={{
                  width: `${percentage}%`,
                  backgroundColor: item.color,
                  minWidth: item.value > 0 ? '3px' : '0',
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AnalyticsDonut({ data, total, label }) {
  const radius = 43;
  const circumference = 2 * Math.PI * radius;
  const segments = data.map((item, index) => {
    const offset = data
      .slice(0, index)
      .reduce((sum, previous) => sum + (total > 0 ? (previous.value / total) * circumference : 0), 0);
    const length = total > 0 ? (item.value / total) * circumference : 0;
    return { ...item, offset, length };
  });

  return (
    <div className="analytics-donut">
      <svg
        viewBox="0 0 120 120"
        role="img"
        aria-label={`${label}: ${data.map((item) => `${item.label} ${item.value}`).join(', ')}`}
      >
        <circle className="analytics-donut-track" cx="60" cy="60" r={radius} />
        {segments.map((item) => (
          <circle
            key={item.label}
            className="analytics-donut-segment"
            cx="60"
            cy="60"
            r={radius}
            stroke={item.color}
            strokeDasharray={`${item.length} ${circumference - item.length}`}
            strokeDashoffset={-item.offset}
          />
        ))}
        <text className="analytics-donut-total" x="60" y="57">
          {total.toLocaleString()}
        </text>
        <text className="analytics-donut-label" x="60" y="73">
          {label}
        </text>
      </svg>
    </div>
  );
}

function AnalyticsLineChart({ data, rangeStart, rangeEnd }) {
  const width = 800;
  const height = 270;
  const left = 44;
  const right = 12;
  const top = 14;
  const bottom = 40;
  const maxValue = Math.max(1, ...data.flatMap((day) =>
    analyticsSeries.map((series) => day[series.key])
  ));
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const firstDay = new Date(`${rangeStart}T00:00:00`).getDate();
  const lastDay = new Date(`${rangeEnd}T00:00:00`).getDate();
  const monthDate = new Date(`${rangeStart}T00:00:00`);
  const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
  const pointFor = (day, value) => ({
    x: left + (
      daysInMonth <= 1
        ? 0
        : ((Number(day.date.slice(-2)) - 1) / (daysInMonth - 1)) * chartWidth
    ),
    y: top + chartHeight - (value / maxValue) * chartHeight,
  });
  const seriesSegments = analyticsSeries.map((series) => {
    const segments = [];
    for (const day of data) {
      const currentDay = Number(day.date.slice(-2));
      const previousSegment = segments.at(-1);
      const previousDay = previousSegment ? Number(previousSegment.at(-1).date.slice(-2)) : null;
      if (!previousSegment || currentDay !== previousDay + 1) segments.push([day]);
      else previousSegment.push(day);
    }
    return { ...series, segments };
  });
  const tickDays = Array.from(
    new Set([firstDay, ...Array.from({ length: Math.floor((lastDay - firstDay) / 5) }, (_, index) => firstDay + (index + 1) * 5), lastDay])
  );

  return (
    <svg
      className="analytics-line-chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Recorded daily requests, items checked out, and returns for ${formatMonthlyActivityRange(rangeStart, rangeEnd)}`}
    >
      {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
        const y = top + chartHeight * (1 - fraction);
        const label = Math.round(maxValue * fraction);
        return (
          <g key={fraction}>
            <line x1={left} x2={width - right} y1={y} y2={y} className="analytics-gridline" />
            <text x={left - 8} y={y + 4} className="analytics-axis-label" textAnchor="end">
              {label}
            </text>
          </g>
        );
      })}
      {seriesSegments.map((series) => series.segments.map((segment) => {
        const path = segment.map((day, index) => {
          const point = pointFor(day, day[series.key]);
          return `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`;
        }).join(' ');
        return (
          <g key={`${series.key}-${segment[0].date}`}>
            <path
              d={path}
              fill="none"
              stroke={series.color}
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            {segment.map((day) => {
              const point = pointFor(day, day[series.key]);
              return (
                <circle
                  key={day.date}
                  cx={point.x}
                  cy={point.y}
                  r="3.5"
                  fill={series.color}
                  stroke="white"
                  strokeWidth="1.5"
                />
              );
            })}
          </g>
        );
      }))}
      {tickDays.map((dayNumber) => {
        const point = pointFor({ date: `${rangeStart.slice(0, 7)}-${String(dayNumber).padStart(2, '0')}` }, 0);
        const label = new Date(`${rangeStart.slice(0, 7)}-${String(dayNumber).padStart(2, '0')}T00:00:00`).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
        });
        return (
          <text
            key={dayNumber}
            x={point.x}
            y={height - 10}
            className="analytics-axis-label"
            textAnchor="middle"
          >
            {label}
          </text>
        );
      })}
    </svg>
  );
}

function getExpectedBorrowConditions(itemId, requestedQuantity, inventory) {
  const item = inventory.find((inventoryItem) => inventoryItem.id === itemId);
  if (!item) return [];

  let remaining = requestedQuantity;
  const conditions = [];
  for (const condition of ['Worn', 'Good', 'New']) {
    const available = item.condition_quantities[condition] || 0;
    if (available > 0 && remaining > 0) {
      conditions.push(condition);
      remaining -= Math.min(available, remaining);
    }
  }

  return remaining > 0 ? [] : conditions;
}

function formatDueDate(dueDate) {
  return dueDate
    ? new Date(`${dueDate}T00:00:00`).toLocaleDateString()
    : 'Not set';
}

function exportBorrowRequestHistory(requests) {
  const headers = [
    'Request ID',
    'Borrower',
    'Request status',
    'Submitted at',
    'Needed by',
    'Reviewed at',
    'Item',
    'Quantity',
  ];
  const escapeCsv = (value) => {
    let text = String(value ?? '');
    if (/^\s*[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  const formatTimestamp = (value) => (
    value ? new Date(value).toLocaleString() : ''
  );
  const rows = requests.flatMap((request) =>
    request.items.map((item) => [
      request.id,
      request.borrower_name,
      request.status,
      formatTimestamp(request.created_at),
      request.due_date ?? '',
      formatTimestamp(request.reviewed_at),
      item.item_title,
      item.quantity,
    ])
  );
  const csv = [headers, ...rows]
    .map((row) => row.map(escapeCsv).join(','))
    .join('\r\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `borrow-request-log-${getLocalDateInputValue()}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function printBorrowRequestHistory(requests) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return false;

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
  const rows = requests.map((request) => `
    <tr>
      <td>#${escapeHtml(request.id)}</td>
      <td>${escapeHtml(request.borrower_name)}</td>
      <td>${escapeHtml(new Date(request.created_at).toLocaleString())}</td>
      <td>${escapeHtml(request.due_date ? formatDueDate(request.due_date) : 'Not set')}</td>
      <td><ul>${request.items.map((item) => (
        `<li>${escapeHtml(item.item_title)} × ${escapeHtml(item.quantity)}</li>`
      )).join('')}</ul></td>
      <td>${escapeHtml(request.reviewed_at ? new Date(request.reviewed_at).toLocaleString() : 'Not reviewed')}</td>
      <td>${escapeHtml(request.status)}</td>
    </tr>
  `).join('');

  printWindow.document.write(`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <title>Borrow request log</title>
        <style>
          body { font: 12px Arial, sans-serif; color: #0f172a; padding: 20px; }
          h1 { font-size: 20px; margin: 0 0 6px; }
          p { color: #475569; margin: 0 0 18px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { padding: 8px; border: 1px solid #cbd5e1; text-align: left; vertical-align: top; }
          th { background: #f1f5f9; }
          ul { margin: 0; padding-left: 18px; }
          li + li { margin-top: 3px; }
          @media print { body { padding: 0; } tr { break-inside: avoid; } }
        </style>
      </head>
      <body>
        <h1>Borrow request transaction log</h1>
        <p>${requests.length} selected request${requests.length === 1 ? '' : 's'} · Printed ${escapeHtml(new Date().toLocaleString())}</p>
        <table>
          <thead><tr><th>Request</th><th>Requested by</th><th>Submitted</th><th>Needed by</th><th>Requested items</th><th>Reviewed</th><th>Status</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <script>window.addEventListener('load', () => window.print());</script>
      </body>
    </html>`);
  printWindow.document.close();
  return true;
}

function getLocalDateInputValue() {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${today.getFullYear()}-${month}-${day}`;
}

function getLocalMonthInputValue() {
  return getLocalDateInputValue().slice(0, 7);
}

function formatMonthlyActivityRange(rangeStart, rangeEnd) {
  if (!rangeStart || !rangeEnd) return 'selected month';
  const firstDay = new Date(`${rangeStart}T00:00:00`);
  const lastDay = new Date(`${rangeEnd}T00:00:00`);
  const month = firstDay.toLocaleDateString(undefined, { month: 'long' });
  return `${month} 1–${lastDay.getDate()}, ${lastDay.getFullYear()}`;
}

function formatMissingActivityRange(range) {
  const start = new Date(`${range.start_date}T00:00:00`);
  const end = new Date(`${range.end_date}T00:00:00`);
  const startLabel = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (range.start_date === range.end_date) return startLabel;
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${startLabel}–${end.getDate()}`;
  }
  return `${startLabel}–${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

export default function App() {
  const [activePage, setActivePage] = useState('Make Request');
  const [authToken, setAuthToken] = useState(() => sessionStorage.getItem('freetime_access_token'));
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(() => Boolean(sessionStorage.getItem('freetime_access_token')));
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginSubmitting, setLoginSubmitting] = useState(false);
  const [items, setItems] = useState([]);
  const [activeBorrows, setActiveBorrows] = useState([]);
  const [myBorrowRequests, setMyBorrowRequests] = useState([]);
  const [pendingBorrowRequests, setPendingBorrowRequests] = useState([]);
  const [borrowRequestHistory, setBorrowRequestHistory] = useState([]);
  const [selectedHistoryRequestIds, setSelectedHistoryRequestIds] = useState([]);
  const [requestHistoryLoading, setRequestHistoryLoading] = useState(true);
  const [accounts, setAccounts] = useState([]);
  const [accountForm, setAccountForm] = useState({
    username: '',
    display_name: '',
    password: '',
    role: 'user',
  });
  const [accountMessage, setAccountMessage] = useState('');
  const [accountError, setAccountError] = useState('');
  const [requestNotificationsOpen, setRequestNotificationsOpen] = useState(false);
  const [decisionPopup, setDecisionPopup] = useState(null);
  const [requestSentPopup, setRequestSentPopup] = useState(null);
  const [unreadDecisionIds, setUnreadDecisionIds] = useState([]);
  const [pendingNotificationRequests, setPendingNotificationRequests] = useState([]);
  const [notificationError, setNotificationError] = useState('');
  const requestStatusesRef = useRef(null);
  const [pendingReturns, setPendingReturns] = useState([]);
  const [returnDecisionConfirmation, setReturnDecisionConfirmation] = useState(null);
  const [checkedOutLoans, setCheckedOutLoans] = useState([]);
  const [borrowCart, setBorrowCart] = useState({});
  const [borrowStep, setBorrowStep] = useState(1);
  const [borrowDueDate, setBorrowDueDate] = useState('');
  const [editingCartItemId, setEditingCartItemId] = useState(null);
  const [cartQuantityDraft, setCartQuantityDraft] = useState('');
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
  const [reviewingRequestId, setReviewingRequestId] = useState(null);
  const [reviewingReturnId, setReviewingReturnId] = useState(null);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [itemsError, setItemsError] = useState('');
  const [analyticsData, setAnalyticsData] = useState(null);
  const [analyticsMonth, setAnalyticsMonth] = useState(getLocalMonthInputValue);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [analyticsError, setAnalyticsError] = useState('');
  const [itemsMessage, setItemsMessage] = useState('');
  const [itemSearch, setItemSearch] = useState('');
  const [allItemsSearch, setAllItemsSearch] = useState('');
  const [borrowQuantityDrafts, setBorrowQuantityDrafts] = useState({});
  const [expandedBorrowRequestIds, setExpandedBorrowRequestIds] = useState([]);

  const resetSessionData = useCallback(() => {
    setItems([]);
    setActiveBorrows([]);
    setMyBorrowRequests([]);
    setPendingBorrowRequests([]);
    setBorrowRequestHistory([]);
    setSelectedHistoryRequestIds([]);
    setPendingReturns([]);
    setReturnDecisionConfirmation(null);
    setCheckedOutLoans([]);
    setBorrowCart({});
    setBorrowStep(1);
    setAccounts([]);
    setAnalyticsData(null);
    setAnalyticsLoading(true);
    setAnalyticsError('');
    setItemsLoading(true);
    setRequestHistoryLoading(true);
    setAccountError('');
    setAccountMessage('');
    setUnreadDecisionIds([]);
    setPendingNotificationRequests([]);
    setNotificationError('');
    setDecisionPopup(null);
    setRequestSentPopup(null);
    setRequestNotificationsOpen(false);
    setItemsError('');
    setItemsMessage('');
    requestStatusesRef.current = null;
  }, []);

  const authenticatedFetch = useCallback(async (url, options = {}) => {
    const headers = new Headers(options.headers || {});
    if (authToken) headers.set('Authorization', `Bearer ${authToken}`);
    const response = await fetch(url, { ...options, headers });
    if (response.status === 401 && authToken) {
      sessionStorage.removeItem('freetime_access_token');
      setAuthToken(null);
      setAuthUser(null);
      resetSessionData();
    }
    return response;
  }, [authToken, resetSessionData]);

  const userProfile = authUser
    ? {
        name: authUser.display_name,
        username: authUser.username,
        role: ROLE_LABELS[authUser.role] || authUser.role,
      }
    : null;

  useEffect(() => {
    if (!authToken || authUser) return undefined;
    const controller = new AbortController();
    fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${authToken}` },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Your sign-in has expired. Please log in again.');
        return response.json();
      })
      .then((user) => {
        resetSessionData();
        setAuthUser(user);
        setActivePage(ROLE_PAGES[user.role][0]);
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          sessionStorage.removeItem('freetime_access_token');
          setAuthToken(null);
          setLoginError(error.message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setAuthLoading(false);
      });
    return () => controller.abort();
  }, [authToken, authUser, resetSessionData]);

  useEffect(() => {
    if (!authUser) return;
    const controller = new AbortController();

    async function loadItems() {
      try {
        const response = await authenticatedFetch(`${API_BASE}/items`, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`Could not load inventory (HTTP ${response.status}).`);
        }
        const data = await response.json();
        setItems(data);
        setItemsError('');
      } catch (error) {
        if (error.name !== 'AbortError') {
          setItemsError(error.message || 'Could not connect to the inventory service.');
        }
      } finally {
        if (!controller.signal.aborted) {
          setItemsLoading(false);
        }
      }
    }

    loadItems();
    return () => controller.abort();
  }, [authUser, authenticatedFetch]);

  useEffect(() => {
    if (!authUser) return undefined;
    if (activePage === 'Analytics') {
      const controller = new AbortController();

      async function refreshAnalytics() {
        setAnalyticsLoading(true);
        try {
          const response = await authenticatedFetch(
            `${API_BASE}/items/analytics/borrow?month=${encodeURIComponent(analyticsMonth)}`,
            {
              signal: controller.signal,
            }
          );
          if (!response.ok) throw new Error(`Could not load analytics (HTTP ${response.status}).`);
          const data = await response.json();
          if (data.month !== analyticsMonth) {
            throw new Error('The server returned analytics for a different month. Please select the month again.');
          }
          if (!controller.signal.aborted) setAnalyticsData(data);
          setAnalyticsError('');
        } catch (error) {
          if (error.name !== 'AbortError') {
            setAnalyticsError(error.message || 'Could not connect to the analytics service.');
          }
        } finally {
          if (!controller.signal.aborted) setAnalyticsLoading(false);
        }
      }

      refreshAnalytics();
      const refreshTimer = window.setInterval(refreshAnalytics, 30000);
      return () => {
        controller.abort();
        window.clearInterval(refreshTimer);
      };
    }

    if (!ROLE_PAGES[authUser.role]?.includes(activePage)) return undefined;
    const controller = new AbortController();

    async function refreshPageData() {
      try {
        if (activePage === 'Approval Request') {
          const [requestsResponse, historyResponse, returnsResponse, checkedOutResponse] = await Promise.all([
            authenticatedFetch(`${API_BASE}/items/requests/pending`, { signal: controller.signal }),
            authenticatedFetch(`${API_BASE}/items/requests/history`, { signal: controller.signal }),
            authenticatedFetch(`${API_BASE}/items/loans/returns/pending`, { signal: controller.signal }),
            authenticatedFetch(`${API_BASE}/items/loans/checked-out`, { signal: controller.signal }),
          ]);
          if (!requestsResponse.ok || !historyResponse.ok || !returnsResponse.ok || !checkedOutResponse.ok) {
            throw new Error('Could not load request history, pending requests, and checked-out items.');
          }
          const [pendingRequests, requestHistory, returns, checkedOut] = await Promise.all([
            requestsResponse.json(),
            historyResponse.json(),
            returnsResponse.json(),
            checkedOutResponse.json(),
          ]);
          setPendingBorrowRequests(pendingRequests);
          setBorrowRequestHistory(requestHistory);
          setRequestHistoryLoading(false);
          setPendingReturns(returns);
          setCheckedOutLoans(checkedOut);
          setItemsError('');
          return;
        }

        if (activePage === 'Overall') {
          const [inventoryResponse, usersResponse] = await Promise.all([
            authenticatedFetch(`${API_BASE}/items`, { signal: controller.signal }),
            authUser.role === 'admin'
              ? authenticatedFetch(`${API_BASE}/auth/users`, { signal: controller.signal })
              : Promise.resolve(null),
          ]);
          if (!inventoryResponse.ok || (usersResponse && !usersResponse.ok)) {
            throw new Error('Could not load inventory or account information.');
          }
          const [inventory, loadedAccounts] = await Promise.all([
            inventoryResponse.json(),
            usersResponse ? usersResponse.json() : Promise.resolve([]),
          ]);
          setItems(inventory);
          if (authUser.role === 'admin') setAccounts(loadedAccounts);
          setItemsError('');
          return;
        }

        const [inventoryResponse, loansResponse, requestsResponse] = await Promise.all([
          authenticatedFetch(`${API_BASE}/items`, { signal: controller.signal }),
          authenticatedFetch(`${API_BASE}/items/loans?borrower_name=${encodeURIComponent(authUser.username)}`, {
            signal: controller.signal,
          }),
          authenticatedFetch(`${API_BASE}/items/requests?borrower_name=${encodeURIComponent(authUser.username)}`, {
            signal: controller.signal,
          }),
        ]);
        if (!inventoryResponse.ok) {
          throw new Error(`Could not load inventory (HTTP ${inventoryResponse.status}).`);
        }
        if (!loansResponse.ok) {
          throw new Error(`Could not load your borrowed items (HTTP ${loansResponse.status}).`);
        }
        if (!requestsResponse.ok) {
          throw new Error(`Could not load your borrow requests (HTTP ${requestsResponse.status}).`);
        }
        const [inventory, loans, requests] = await Promise.all([
          inventoryResponse.json(),
          loansResponse.json(),
          requestsResponse.json(),
        ]);
        setItems(inventory);
        setActiveBorrows(loans);
        setMyBorrowRequests(requests);
        const requestStatuses = Object.fromEntries(requests.map((request) => [request.id, request.status]));
        if (requestStatusesRef.current === null) {
          requestStatusesRef.current = requestStatuses;
        } else {
          const changedRequests = requests.filter((request) =>
            requestStatusesRef.current[request.id] === 'pending'
            && (request.status === 'approved' || request.status === 'rejected')
          );
          requestStatusesRef.current = requestStatuses;
          if (changedRequests.length > 0) {
            setUnreadDecisionIds((currentIds) => [
              ...new Set([...currentIds, ...changedRequests.map((request) => request.id)]),
            ]);
            setDecisionPopup(changedRequests[0]);
          }
        }
        setItemsError('');
      } catch (error) {
        if (error.name !== 'AbortError') {
          if (activePage === 'Approval Request') setRequestHistoryLoading(false);
          setItemsError(error.message || 'Could not refresh inventory data.');
        }
      }
    }

    refreshPageData();
    const refreshTimer = window.setInterval(refreshPageData, 10000);
    return () => {
      controller.abort();
      window.clearInterval(refreshTimer);
    };
  }, [activePage, analyticsMonth, authUser, authenticatedFetch]);

  useEffect(() => {
    if (!authUser || !['admin', 'dev_user'].includes(authUser.role)) return undefined;
    const controller = new AbortController();

    async function refreshPendingNotifications() {
      try {
        const response = await authenticatedFetch(`${API_BASE}/items/requests/pending`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Could not load new request notifications (HTTP ${response.status}).`);
        setPendingNotificationRequests(await response.json());
        setNotificationError('');
      } catch (error) {
        if (error.name !== 'AbortError') {
          setNotificationError(error.message || 'Could not refresh request notifications.');
        }
      }
    }

    refreshPendingNotifications();
    const refreshTimer = window.setInterval(refreshPendingNotifications, 10000);
    return () => {
      controller.abort();
      window.clearInterval(refreshTimer);
    };
  }, [authUser, authenticatedFetch]);

  async function submitLogin(event) {
    event.preventDefault();
    setLoginSubmitting(true);
    setLoginError('');
    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername, password: loginPassword }),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        throw new Error(detail?.detail || 'Could not sign in.');
      }
      const result = await response.json();
      sessionStorage.setItem('freetime_access_token', result.access_token);
      resetSessionData();
      setAuthToken(result.access_token);
      setAuthUser(result.user);
      setActivePage(ROLE_PAGES[result.user.role][0]);
      setLoginPassword('');
    } catch (error) {
      setLoginError(error.message || 'Could not connect to the sign-in service.');
    } finally {
      setLoginSubmitting(false);
    }
  }

  async function logout() {
    try {
      if (authToken) {
        const response = await authenticatedFetch(`${API_BASE}/auth/logout`, { method: 'POST' });
        if (!response.ok && response.status !== 401) {
          setItemsError(`Could not revoke the server session (HTTP ${response.status}).`);
        }
      }
    } catch (error) {
      setItemsError(`Could not contact the server to revoke the session: ${error.message}`);
    } finally {
      sessionStorage.removeItem('freetime_access_token');
      setAuthToken(null);
      setAuthUser(null);
      resetSessionData();
      setLoginPassword('');
    }
  }

  async function createAccount(event) {
    event.preventDefault();
    setAccountError('');
    setAccountMessage('');
    try {
      const response = await authenticatedFetch(`${API_BASE}/auth/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(accountForm),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        throw new Error(detail?.detail || `Could not create account (HTTP ${response.status}).`);
      }
      const createdAccount = await response.json();
      setAccounts((currentAccounts) => [...currentAccounts, createdAccount]);
      setAccountMessage(`Account ${createdAccount.username} created with the ${ROLE_LABELS[createdAccount.role]} role.`);
      setAccountForm({ username: '', display_name: '', password: '', role: 'user' });
    } catch (error) {
      setAccountError(error.message || 'Could not create account.');
    }
  }

  function addToBorrowRequest(item) {
    const quantity = Number(borrowQuantityDrafts[item.id] ?? '1');
    if (!Number.isInteger(quantity) || quantity < 1) {
      setItemsError('Request quantity must be a whole number greater than zero.');
      return;
    }
    if (quantity > item.quantity) {
      setItemsError(`Only ${item.quantity} of ${item.title} are currently available.`);
      return;
    }

    setItemsError('');
    setItemsMessage('');
    setBorrowCart((currentCart) => ({
      ...currentCart,
      [item.id]: { item_id: item.id, title: item.title, quantity },
    }));
    setItemsMessage(`${item.title} added to your borrow request.`);
  }

  function startEditingCartItem(item) {
    setItemsError('');
    setItemsMessage('');
    setEditingCartItemId(item.item_id);
    setCartQuantityDraft(String(item.quantity));
  }

  function cancelEditingCartItem() {
    setEditingCartItemId(null);
    setCartQuantityDraft('');
  }

  function confirmCartQuantity(item) {
    const quantity = Number(cartQuantityDraft);
    const inventoryItem = items.find((currentItem) => currentItem.id === item.item_id);
    const availableQuantity = inventoryItem?.quantity ?? 0;
    if (!Number.isInteger(quantity) || quantity < 1) {
      setItemsError('Request quantity must be a whole number greater than zero.');
      return;
    }
    if (quantity > availableQuantity) {
      setItemsError(`Only ${availableQuantity} of ${item.title} are currently available.`);
      return;
    }

    setBorrowCart((currentCart) => ({
      ...currentCart,
      [item.item_id]: { ...item, quantity },
    }));
    setItemsError('');
    setItemsMessage(`${item.title} quantity updated.`);
    cancelEditingCartItem();
  }

  async function submitBorrowRequest() {
    const requestedItems = Object.values(borrowCart);
    if (requestedItems.length === 0) {
      setItemsError('Add at least one item to your request.');
      return;
    }
    if (!borrowDueDate) {
      setItemsError('Choose a due date for this borrow request.');
      return;
    }

    setIsSubmittingRequest(true);
    setItemsError('');
    setItemsMessage('');
    try {
      const response = await authenticatedFetch(`${API_BASE}/items/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          borrower_name: userProfile.username,
          due_date: borrowDueDate,
          items: requestedItems.map(({ item_id, quantity }) => ({ item_id, quantity })),
        }),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        throw new Error(detail?.detail || `Could not submit request (HTTP ${response.status}).`);
      }

      const borrowRequest = await response.json();
      setMyBorrowRequests((currentRequests) => [borrowRequest, ...currentRequests]);
      requestStatusesRef.current = {
        ...(requestStatusesRef.current || {}),
        [borrowRequest.id]: borrowRequest.status,
      };
      setPendingBorrowRequests((currentRequests) => [borrowRequest, ...currentRequests]);
      setBorrowCart({});
      setBorrowDueDate('');
      setBorrowStep(1);
      setItemsMessage('');
      setRequestSentPopup(borrowRequest);
    } catch (error) {
      setItemsError(error.message || 'Could not submit the borrow request.');
    } finally {
      setIsSubmittingRequest(false);
    }
  }

  async function reviewBorrowRequest(request, status) {
    setReviewingRequestId(request.id);
    setItemsError('');
    setItemsMessage('');
    try {
      const response = await authenticatedFetch(`${API_BASE}/items/requests/${request.id}/decision`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        throw new Error(detail?.detail || `Could not ${status} request (HTTP ${response.status}).`);
      }

      const reviewedRequest = await response.json();
      setPendingBorrowRequests((currentRequests) =>
        currentRequests.filter((currentRequest) => currentRequest.id !== request.id)
      );
      setMyBorrowRequests((currentRequests) =>
        currentRequests.map((currentRequest) =>
          currentRequest.id === request.id ? reviewedRequest : currentRequest
        )
      );
      if (status === 'approved') {
        setItems((currentItems) =>
          currentItems.map((item) => {
            const requestedItem = reviewedRequest.items.find(
              (requestItem) => requestItem.item_id === item.id
            );
            if (!requestedItem) return item;
            return {
              ...item,
              quantity: requestedItem.available_quantity,
              borrowed_count: item.borrowed_count + requestedItem.quantity,
            };
          })
        );
      }
      setItemsMessage(`Request #${request.id} ${status}.`);
    } catch (error) {
      setItemsError(error.message || `Could not ${status} the request.`);
    } finally {
      setReviewingRequestId(null);
    }
  }

  async function reviewBorrowReturn(borrow, status) {
    setReviewingReturnId(borrow.id);
    setItemsError('');
    setItemsMessage('');
    try {
      const response = await authenticatedFetch(`${API_BASE}/items/loans/${borrow.id}/return-decision`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        throw new Error(detail?.detail || `Could not record the ${status} outcome (HTTP ${response.status}).`);
      }

      const reviewedReturn = await response.json();
      const rejected = status === 'rejected';
      setPendingReturns((currentReturns) => currentReturns.filter(
        (currentReturn) => currentReturn.id !== borrow.id
      ));
      setActiveBorrows((currentBorrows) => currentBorrows.map((currentBorrow) =>
        currentBorrow.id === borrow.id ? reviewedReturn : currentBorrow
      ));
      if (rejected) {
        setCheckedOutLoans((currentLoans) => currentLoans.some((currentLoan) => currentLoan.id === borrow.id)
          ? currentLoans.map((currentLoan) => currentLoan.id === borrow.id ? reviewedReturn : currentLoan)
          : [...currentLoans, reviewedReturn]);
      } else {
        setCheckedOutLoans((currentLoans) =>
          currentLoans.filter((currentLoan) => currentLoan.id !== borrow.id)
        );
      }
      const inventoryResponse = await authenticatedFetch(`${API_BASE}/items`);
      if (!inventoryResponse.ok) {
        throw new Error(`Return outcome was saved, but inventory could not be refreshed (HTTP ${inventoryResponse.status}).`);
      }
      setItems(await inventoryResponse.json());
      const messages = {
        confirmed: `${borrow.item_title} returned and added back to available stock.`,
        broken: `${borrow.item_title} recorded as returned broken and excluded from available stock.`,
        lost: `${borrow.item_title} recorded as lost and removed from available stock.`,
        rejected: `Return report rejected for ${borrow.item_title}; it remains checked out.`,
      };
      setItemsMessage(messages[status]);
    } catch (error) {
      setItemsError(error.message || `Could not record the ${status} outcome.`);
    } finally {
      setReviewingReturnId(null);
    }
  }

  const filteredItems = items.filter((item) =>
    item.category === 'stationery'
    && item.title.toLowerCase().includes(itemSearch.trim().toLowerCase())
  );
  const availableItems = filteredItems
    .filter((item) => !borrowCart[item.id])
    .flatMap((item) => {
      const statuses = ['New', 'Good', 'Worn'];
      const statusRows = statuses
        .filter((condition) => item.condition_quantities[condition] > 0)
        .map((condition) => ({
          ...item,
          rowCondition: condition,
          rowQuantity: item.condition_quantities[condition],
        }));
      return statusRows.length > 0
        ? statusRows
        : [{ ...item, rowCondition: 'Unavailable', rowQuantity: 0 }];
    });
  const filteredAllItems = items.filter((item) =>
    `${item.title} ${item.category} ${item.id}`
      .toLowerCase()
      .includes(allItemsSearch.trim().toLowerCase())
  ).flatMap((item) => {
    return ['New', 'Good', 'Worn', 'Broken'].map((quality) => ({
        ...item,
        quality,
        quality_quantity: item.condition_quantities[quality] ?? 0,
      }));
  });
  const totalStock = items.reduce(
    (total, item) => total + Object.values(item.condition_quantities).reduce((sum, quantity) => sum + quantity, 0),
    0
  );

  const borrowRequestsWithLoans = myBorrowRequests.map((request) => {
    const requestLoans = activeBorrows.filter((borrow) => borrow.request_id === request.id);
    const itemsWithStatus = request.items.map((item) => ({
      ...item,
      loans: requestLoans.filter((borrow) => borrow.item_id === item.item_id),
    }));
    return {
      ...request,
      itemsWithStatus,
      onUseCount: requestLoans.filter((borrow) =>
        borrow.status === 'checked_out' || borrow.status === 'return_requested'
      ).length,
      returnedCount: requestLoans.filter((borrow) =>
        borrow.status === 'returned' && (!borrow.return_condition || borrow.return_condition === 'good')
      ).length,
      brokenCount: requestLoans.filter((borrow) =>
        borrow.status === 'returned' && borrow.return_condition === 'broken'
      ).length,
      lostCount: requestLoans.filter((borrow) =>
        borrow.status === 'returned' && borrow.return_condition === 'lost'
      ).length,
    };
  });
  const returnReviewGroups = Object.values([...checkedOutLoans, ...pendingReturns].reduce((groups, borrow) => {
    const groupKey = borrow.request_id == null
      ? `loan-${borrow.id}`
      : `request-${borrow.request_id}`;
    if (!groups[groupKey]) {
      groups[groupKey] = {
        key: groupKey,
        requestId: borrow.request_id,
        borrowerName: borrow.borrower_name,
        dueDate: borrow.due_date,
        borrowedAt: borrow.borrowed_at,
        loans: [],
      };
    }
    groups[groupKey].loans.push(borrow);
    return groups;
  }, {})).map((group) => ({
    ...group,
    onUseCount: group.loans.filter((borrow) => borrow.status === 'checked_out').length,
    awaitingCount: group.loans.filter((borrow) => borrow.status === 'return_requested').length,
  }));

  const renderPage = () => {
    if (activePage === 'Overall') {
      return (
        <section className="screen-block">
          <div className="section-header">
            <div>
              <div className="eyebrow">Database Inventory</div>
              <h1>Overall</h1>
            </div>
            <span className="status-pill status-pill--blue">
              {itemsLoading ? 'Loading…' : `${totalStock} units in stock`}
            </span>
          </div>

          <div className="panel inventory-panel">
            <div className="panel-header">
              <div>
                <h3>Stock overview</h3>
                <span className="inventory-count">
                  {items.length} different items · stock refreshes automatically
                </span>
              </div>
              <input
                aria-label="Search all items"
                className="inventory-search"
                placeholder="Search all items"
                value={allItemsSearch}
                onChange={(event) => setAllItemsSearch(event.target.value)}
              />
            </div>

            {itemsError && <p className="inventory-error" role="alert">{itemsError}</p>}

            <div className="inventory-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Item ID</th>
                    <th>Item name</th>
                    <th>Category</th>
                    <th>Quality</th>
                    <th>Available qty</th>
                    <th>Times used</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAllItems.map((item) => {
                    const rowKey = `${item.id}-${item.quality}`;
                    const tone = {
                      New: 'green',
                      Good: 'blue',
                      Worn: 'amber',
                      Broken: 'red',
                    }[item.quality] || 'slate';
                    const timesUsed = {
                      New: '0 times',
                      Good: '1–5 times',
                      Worn: '6–10 times',
                      Broken: '>10 times',
                    }[item.quality] || '-';
                    const itemColor = getItemColor(item.title);
                    return (
                      <tr
                        key={rowKey}
                        className="inventory-item-row"
                        style={{
                          '--item-accent': itemColor.accent,
                          '--item-tint': itemColor.tint,
                        }}
                      >
                        <td>{item.id}</td>
                        <td className="inventory-item-name">{item.title}</td>
                        <td>
                          <span className="status-pill status-pill--slate">
                            {item.category}
                          </span>
                        </td>
                        <td>
                          <span className={`status-pill status-pill--${tone}`}>{item.quality}</span>
                        </td>
                        <td>
                          <span className={item.quality_quantity > 0 ? 'stock-count' : 'stock-count stock-count--empty'}>
                            {item.quality_quantity}
                          </span>
                        </td>
                        <td>{timesUsed}</td>
                      </tr>
                    );
                  })}
                  {!itemsLoading && filteredAllItems.length === 0 && (
                    <tr>
                      <td colSpan="6">{itemsError ? 'Inventory unavailable.' : 'No items found.'}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          {authUser.role === 'admin' && (
            <section className="panel account-management-panel" aria-labelledby="accounts-title">
              <div className="panel-header account-panel-header">
                <div>
                  <div className="eyebrow">Access &amp; security</div>
                  <h3 id="accounts-title">Manage accounts</h3>
                  <span className="inventory-count">
                    Create sign-in accounts and choose what each role can access.
                  </span>
                </div>
                <span className="account-total">
                  <strong>{accounts.length}</strong>
                  <span>{accounts.length === 1 ? 'account' : 'accounts'}</span>
                </span>
              </div>
              {accountError && <p className="inventory-error" role="alert">{accountError}</p>}
              {accountMessage && <p className="inventory-success" role="status">{accountMessage}</p>}
              <form className="account-create-form" onSubmit={createAccount}>
                <label>
                  Username
                  <input
                    autoComplete="off"
                    minLength="3"
                    maxLength="80"
                    pattern="[A-Za-z0-9._-]+"
                    required
                    value={accountForm.username}
                    onChange={(event) => setAccountForm({ ...accountForm, username: event.target.value })}
                  />
                </label>
                <label>
                  Display name
                  <input
                    maxLength="150"
                    required
                    value={accountForm.display_name}
                    onChange={(event) => setAccountForm({ ...accountForm, display_name: event.target.value })}
                  />
                </label>
                <label>
                  Temporary password <span className="account-field-hint">At least 12 characters</span>
                  <input
                    autoComplete="new-password"
                    minLength="12"
                    maxLength="256"
                    required
                    type="password"
                    value={accountForm.password}
                    onChange={(event) => setAccountForm({ ...accountForm, password: event.target.value })}
                  />
                </label>
                <label>
                  Role
                  <select
                    value={accountForm.role}
                    onChange={(event) => setAccountForm({ ...accountForm, role: event.target.value })}
                  >
                    <option value="user">User — Make Request</option>
                    <option value="admin">Admin — inventory, verification, analytics</option>
                    <option value="dev_user">Dev User — all pages</option>
                  </select>
                </label>
                <button className="primary-button" type="submit">Create account</button>
              </form>
              <div className="account-list-heading">
                <h4>Team accounts</h4>
                <span>Passwords are never shown here.</span>
              </div>
              {accounts.length === 0 ? (
                <p className="empty-state">No accounts found.</p>
              ) : (
                <div className="account-list">
                  {accounts.map((account) => (
                    <article className="account-card" key={account.id}>
                      <div className="account-avatar" aria-hidden="true">
                        {account.display_name.trim().charAt(0).toUpperCase()}
                      </div>
                      <div className="account-card-identity">
                        <strong>{account.display_name}</strong>
                        <span>@{account.username}</span>
                      </div>
                      <span className={`status-pill status-pill--${account.role === 'admin' ? 'blue' : 'slate'}`}>
                        {ROLE_LABELS[account.role]}
                      </span>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}
        </section>
      );
    }

    if (activePage === 'Approval Request') {
      const selectedHistoryRequests = borrowRequestHistory.filter((request) =>
        selectedHistoryRequestIds.includes(request.id)
      );
      const allHistoryRequestsSelected = borrowRequestHistory.length > 0
        && selectedHistoryRequests.length === borrowRequestHistory.length;

      return (
        <section className="screen-block">
          <div className="section-header">
            <div>
              <div className="eyebrow">Admin Verification</div>
              <h1>Borrow Request Verification</h1>
            </div>
            <div className="toggle-row">
              <span className="status-pill status-pill--amber">
                Pending Review ({pendingBorrowRequests.length} Requests)
              </span>
              <span className="status-pill status-pill--blue">Auto-Verification Engine: Active</span>
              <span className="status-pill status-pill--slate">Inventory connected</span>
            </div>
          </div>

          {itemsError && <p className="inventory-error" role="alert">{itemsError}</p>}
          {itemsMessage && <p className="inventory-success" role="status">{itemsMessage}</p>}

          <div className="double-column admin-grid">
            <div className="panel">
              <div className="panel-header">
                <div>
                  <h3>Requests awaiting approval</h3>
                  <span className="inventory-count">Soonest requested use date first</span>
                </div>
                <span className="request-id">{pendingBorrowRequests.length} pending</span>
              </div>
              {pendingBorrowRequests.length === 0 && (
                <p className="empty-state">There are no borrow requests waiting for review.</p>
              )}
              {pendingBorrowRequests.map((request) => (
                <article key={request.id} className="borrow-request-card verification-request-card">
                  <div className="verification-request-header">
                    <div className="verification-request-title">
                      <strong>Request #{request.id}</strong>
                      <span>Borrow request awaiting your review</span>
                    </div>
                    <span className="status-pill status-pill--amber verification-pending-pill">
                      Awaiting approval
                    </span>
                  </div>
                  <div className="verification-request-meta">
                    <div>
                      <span>REQUESTED BY</span>
                      <strong>{request.borrower_name}</strong>
                    </div>
                    <div>
                      <span>SUBMITTED</span>
                      <strong>{new Date(request.created_at).toLocaleString()}</strong>
                    </div>
                    <div className="verification-due-date">
                      <span>NEEDED BY</span>
                      <strong>{formatDueDate(request.due_date)}</strong>
                    </div>
                  </div>
                  <div className="verification-items-heading">
                    <span>Requested items</span>
                    <span>Quantity</span>
                    <span>Available</span>
                  </div>
                  <ul className="borrow-request-items">
                    {request.items.map((item) => (
                      <li key={item.item_id} className="verification-request-item">
                        <strong>{item.item_title}</strong>
                        <span className="verification-item-quantity">× {item.quantity}</span>
                        <span className={`verification-item-availability${item.available_quantity < item.quantity ? ' is-insufficient' : ''}`}>
                          {item.available_quantity} available
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="action-row request-review-actions verification-request-actions">
                    <button
                      type="button"
                      className="primary-button"
                      disabled={reviewingRequestId === request.id}
                      onClick={() => reviewBorrowRequest(request, 'approved')}
                    >
                      {reviewingRequestId === request.id ? 'Reviewing…' : 'Approve & checkout'}
                    </button>
                    <button
                      type="button"
                      className="danger-button"
                      disabled={reviewingRequestId === request.id}
                      onClick={() => reviewBorrowRequest(request, 'rejected')}
                    >
                      Reject
                    </button>
                  </div>
                </article>
              ))}
              <div className="panel-header return-review-header">
                <div>
                  <h3>Borrow requests awaiting return</h3>
                  <span className="inventory-count">Choose usable return, broken, or lost for each item.</span>
                </div>
                <span className="request-id">{returnReviewGroups.length} requests</span>
              </div>
              {returnReviewGroups.length === 0 && (
                <p className="empty-state">There are no requests awaiting item return.</p>
              )}
              {returnReviewGroups.map((requestGroup) => (
                <article key={requestGroup.key} className="borrow-request-card checked-out-request-card">
                  <div className="borrow-request-header checked-out-request-header">
                    <div>
                      <strong>
                        {requestGroup.requestId ? `Request #${requestGroup.requestId}` : 'Older checkout'}
                      </strong>
                      <span>Borrowed by {requestGroup.borrowerName}</span>
                      <span>Due date: {formatDueDate(requestGroup.dueDate)}</span>
                    </div>
                    <span className={`status-pill status-pill--${requestGroup.awaitingCount ? 'amber' : 'blue'}`}>
                      {requestGroup.onUseCount > 0 && `${requestGroup.onUseCount} on use`}
                      {requestGroup.onUseCount > 0 && requestGroup.awaitingCount > 0 && ' · '}
                      {requestGroup.awaitingCount > 0 && `${requestGroup.awaitingCount} awaiting confirmation`}
                    </span>
                  </div>
                  <ul className="borrow-request-items checked-out-request-items">
                    {requestGroup.loans.map((borrow) => (
                      <li key={borrow.id} className="checked-out-request-item">
                        <div className="checked-out-item-summary">
                          <strong>{borrow.item_title} × {borrow.quantity}</strong>
                          {borrow.status === 'return_requested' ? (
                            <>
                              <span className="status-pill status-pill--amber">Awaiting confirmation</span>
                              <span className="checked-out-return-reported">
                                Reported {borrow.return_requested_at
                                  ? new Date(borrow.return_requested_at).toLocaleString()
                                  : 'by borrower'}
                              </span>
                            </>
                          ) : (
                            <span className="status-pill status-pill--blue">On use</span>
                          )}
                        </div>
                        <div className="checked-out-return-actions">
                          <button
                            type="button"
                            className="primary-button return-action-usable"
                            disabled={reviewingReturnId === borrow.id}
                            onClick={() => reviewBorrowReturn(borrow, 'confirmed')}
                          >
                            {reviewingReturnId === borrow.id ? 'Updating…' : 'Return — usable'}
                          </button>
                          <button
                            type="button"
                            className="secondary-button checked-out-return-broken return-action-broken"
                            disabled={reviewingReturnId === borrow.id}
                            onClick={() => setReturnDecisionConfirmation({ borrow, status: 'broken' })}
                          >
                            Mark broken
                          </button>
                          <button
                            type="button"
                            className="danger-button return-action-lost"
                            disabled={reviewingReturnId === borrow.id}
                            onClick={() => setReturnDecisionConfirmation({ borrow, status: 'lost' })}
                          >
                            Mark lost
                          </button>
                          {borrow.status === 'return_requested' && (
                            <button
                              type="button"
                              className="secondary-button return-action-reject"
                              disabled={reviewingReturnId === borrow.id}
                              onClick={() => reviewBorrowReturn(borrow, 'rejected')}
                            >
                              Reject report
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>

          <div className="panel request-history-panel">
            <div className="panel-header request-history-header">
              <div>
                <h3>Borrow request transaction log</h3>
                <span className="inventory-count">
                  All requests from users, including pending, approved, and rejected
                </span>
              </div>
              <div className="request-history-actions">
                <span className="request-id">
                  {selectedHistoryRequests.length} of {borrowRequestHistory.length} selected
                </span>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={requestHistoryLoading || selectedHistoryRequests.length === 0}
                  onClick={() => {
                    if (!printBorrowRequestHistory(selectedHistoryRequests)) {
                      setItemsError('Could not open the print window. Allow pop-ups and try again.');
                    }
                  }}
                >
                  Print selected
                </button>
                <button
                  type="button"
                  className="primary-button"
                  disabled={requestHistoryLoading || selectedHistoryRequests.length === 0}
                  onClick={() => exportBorrowRequestHistory(selectedHistoryRequests)}
                >
                  Export selected for Excel
                </button>
              </div>
            </div>
            {requestHistoryLoading ? (
              <p className="empty-state">Loading request history…</p>
            ) : borrowRequestHistory.length === 0 ? (
              <p className="empty-state">No borrow requests have been recorded yet.</p>
            ) : (
              <div className="request-history-table-wrap">
                <table className="data-table request-history-table">
                  <thead>
                    <tr>
                      <th>
                        <label className="request-history-select-all">
                          <input
                            type="checkbox"
                            aria-label="Select all borrow requests"
                            checked={allHistoryRequestsSelected}
                            onChange={(event) => {
                              setSelectedHistoryRequestIds(
                                event.target.checked ? borrowRequestHistory.map((request) => request.id) : []
                              );
                            }}
                          />
                          <span>Select</span>
                        </label>
                      </th>
                      <th>Request</th>
                      <th>Requested by</th>
                      <th>Submitted</th>
                      <th>Needed by</th>
                      <th>Requested items</th>
                      <th>Reviewed</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {borrowRequestHistory.map((request) => {
                      const statusTone = {
                        approved: 'green',
                        pending: 'amber',
                        rejected: 'red',
                      }[request.status] || 'slate';
                      return (
                        <tr key={request.id}>
                          <td>
                            <input
                              type="checkbox"
                              aria-label={`Select request ${request.id}`}
                              checked={selectedHistoryRequestIds.includes(request.id)}
                              onChange={(event) => {
                                setSelectedHistoryRequestIds((currentIds) => (
                                  event.target.checked
                                    ? [...currentIds, request.id]
                                    : currentIds.filter((id) => id !== request.id)
                                ));
                              }}
                            />
                          </td>
                          <td><strong>#{request.id}</strong></td>
                          <td>{request.borrower_name}</td>
                          <td>{new Date(request.created_at).toLocaleString()}</td>
                          <td>{formatDueDate(request.due_date)}</td>
                          <td>
                            <ul className="request-history-items">
                              {request.items.map((item) => (
                                <li key={item.item_id}>
                                  {item.item_title} <strong>× {item.quantity}</strong>
                                </li>
                              ))}
                            </ul>
                          </td>
                          <td>{request.reviewed_at ? new Date(request.reviewed_at).toLocaleString() : '—'}</td>
                          <td>
                            <span className={`status-pill status-pill--${statusTone}`}>
                              {request.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      );
    }

    if (activePage === 'Analytics') {
      const metrics = analyticsData
        ? [
            { label: 'Borrow requests', value: analyticsData.total_requests },
            { label: 'Items currently on use', value: analyticsData.currently_on_use },
            { label: 'Borrowed units · all time', value: analyticsData.total_borrowed_units },
            { label: 'Broken / lost returns', value: analyticsData.returned_broken + analyticsData.lost_units },
          ]
        : [];
      const conditionCounts = analyticsData
        ? [
            { label: 'New', value: analyticsData.available_new, color: '#059669' },
            { label: 'Good', value: analyticsData.available_good, color: '#2563eb' },
            { label: 'Worn', value: analyticsData.available_worn, color: '#d97706' },
            { label: 'Broken', value: analyticsData.available_broken, color: '#dc2626' },
          ]
        : [];
      const conditionTotal = conditionCounts.reduce((sum, item) => sum + item.value, 0);
      const requestCounts = [
        { label: 'Approved', value: analyticsData?.approved_requests ?? 0, color: '#059669' },
        { label: 'Pending', value: analyticsData?.pending_requests ?? 0, color: '#d97706' },
        { label: 'Rejected', value: analyticsData?.rejected_requests ?? 0, color: '#dc2626' },
      ];
      const requestTotal = requestCounts.reduce((sum, item) => sum + item.value, 0);
      const returnCounts = [
        { label: 'Usable', value: analyticsData?.returned_usable ?? 0, color: '#059669' },
        { label: 'Broken', value: analyticsData?.returned_broken ?? 0, color: '#dc2626' },
        { label: 'Lost', value: analyticsData?.lost_units ?? 0, color: '#64748b' },
      ];
      const returnTotal = returnCounts.reduce((sum, item) => sum + item.value, 0);
      const topBorrowedItems = analyticsData?.top_items.slice(0, 5) ?? [];
      const maxBorrowed = Math.max(...topBorrowedItems.map((item) => item.borrowed_units), 0);
      const borrowScaleMax = Math.max(4, Math.ceil(maxBorrowed / 4) * 4);
      const borrowScale = Array.from({ length: 5 }, (_, index) =>
          Math.round((borrowScaleMax * index) / 4)
      );

      return (
        <section className="screen-block">
          <div className="section-header">
            <div>
              <div className="eyebrow">Operational Analytics</div>
              <h1>Borrowing &amp; inventory</h1>
            </div>
            <div className="toggle-row">
              <span className="status-pill status-pill--blue">
                {analyticsLoading ? 'Refreshing data…' : 'Live database data'}
              </span>
            </div>
          </div>

          {analyticsError && <p className="inventory-error" role="alert">{analyticsError}</p>}
          {analyticsLoading && !analyticsData && <p className="empty-state">Loading analytics…</p>}
          {analyticsData?.month === analyticsMonth && (
            <>
              <div className="analytics-kpi-grid">
                {metrics.map((metric) => (
                  <article className="analytics-kpi" key={metric.label}>
                    <span>{metric.label}</span>
                    <strong>{metric.value.toLocaleString()}</strong>
                  </article>
                ))}
              </div>

              <div className="analytics-grid">
                <div className="panel demand-panel">
                  <div className="panel-header">
                    <div>
                      <h3>Borrowing activity</h3>
                      <span className="chart-caption">
                        Recorded daily totals · {formatMonthlyActivityRange(
                          analyticsData.range_start,
                          analyticsData.range_end
                        )}
                      </span>
                    </div>
                    <label className="analytics-month-picker" htmlFor="analytics-month">
                      <span>Select month</span>
                      <input
                        id="analytics-month"
                        type="month"
                        max={getLocalMonthInputValue()}
                        value={analyticsMonth}
                        onChange={(event) => {
                          if (!event.target.value) return;
                          setAnalyticsMonth(event.target.value);
                          setAnalyticsData(null);
                          setAnalyticsLoading(true);
                          setAnalyticsError('');
                        }}
                      />
                    </label>
                  </div>
                  <div className="analytics-legend">
                    {analyticsSeries.map((series) => (
                      <span key={series.key}>
                        <i style={{ backgroundColor: series.color }} />
                        {series.label}
                      </span>
                    ))}
                  </div>
                  {analyticsData.missing_ranges.length > 0 && (
                    <div className="analytics-missing-data" role="status">
                      <strong>No database activity records found for:</strong>
                      <span>
                        {analyticsData.missing_ranges.map(formatMissingActivityRange).join(', ')}
                      </span>
                      <small>
                        These dates are omitted from the chart, not assumed to be zero. No records were added.
                      </small>
                    </div>
                  )}
                  <div className="analytics-chart-wrap">
                    {analyticsData.daily_activity.length > 0 ? (
                      <AnalyticsLineChart
                        data={analyticsData.daily_activity}
                        rangeStart={analyticsData.range_start}
                        rangeEnd={analyticsData.range_end}
                      />
                    ) : (
                      <p className="empty-state">No activity records exist for this month.</p>
                    )}
                  </div>
                </div>

                <div className="panel">
                  <div className="panel-header">
                    <div>
                      <h3>Return outcomes</h3>
                      <span className="chart-caption">Recorded for returned items</span>
                    </div>
                  </div>
                  <div className="analytics-category-section">
                    <h4>Items returned</h4>
                    <div className="analytics-donut-layout">
                      <AnalyticsDonut data={returnCounts} total={returnTotal} label="items" />
                      <AnalyticsCategoryBars data={returnCounts} total={returnTotal} unit="items" />
                    </div>
                  </div>
                  <div className="analytics-category-section">
                    <h4>Request decisions</h4>
                    <div className="analytics-donut-layout">
                      <AnalyticsDonut data={requestCounts} total={requestTotal} label="requests" />
                      <AnalyticsCategoryBars data={requestCounts} total={requestTotal} unit="requests" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="analytics-grid analytics-grid--bottom">
                <div className="panel">
                  <div className="panel-header">
                    <div>
                      <h3>Most borrowed items</h3>
                      <span className="chart-caption">
                        Top 5 items · longer bars mean more units borrowed
                      </span>
                    </div>
                  </div>
                  {topBorrowedItems.length === 0 ? (
                    <p className="empty-state">No borrowing history has been recorded yet.</p>
                  ) : (
                    <div className="analytics-bar-chart">
                      {topBorrowedItems.map((item, index) => (
                        <div className="analytics-bar-row" key={item.item_title}>
                          <div className="analytics-bar-heading">
                            <span className="rank">#{index + 1}</span>
                            <strong title={item.item_title}>{item.item_title}</strong>
                            <span className="analytics-bar-value">{item.borrowed_units} units</span>
                          </div>
                          <div
                            className="analytics-bar-track"
                            role="img"
                            aria-label={`${item.item_title}: ${item.borrowed_units} units borrowed`}
                          >
                            <span style={{ width: `${(item.borrowed_units / borrowScaleMax) * 100}%` }} />
                          </div>
                          {(item.currently_on_use > 0 || item.returned_broken > 0 || item.lost > 0) && (
                            <div className="analytics-item-flags">
                              {item.currently_on_use > 0 && <span>{item.currently_on_use} on use</span>}
                              {item.returned_broken > 0 && <span className="broken">{item.returned_broken} broken</span>}
                              {item.lost > 0 && <span className="lost">{item.lost} lost</span>}
                            </div>
                          )}
                        </div>
                      ))}
                      <div className="analytics-bar-axis" aria-hidden="true">
                        {borrowScale.map((value, index) => (
                          <span key={`${index}-${value}`} style={{ left: `${index * 25}%` }}>
                            {value}
                          </span>
                        ))}
                      </div>
                      <div className="analytics-axis-caption">Units borrowed</div>
                    </div>
                  )}
                </div>

                <div className="panel">
                  <div className="panel-header">
                    <div>
                      <h3>Available inventory condition</h3>
                      <span className="chart-caption">Usable and broken units currently in stock</span>
                    </div>
                    <strong>{conditionTotal.toLocaleString()} units</strong>
                  </div>
                  <AnalyticsCategoryBars data={conditionCounts} total={conditionTotal} unit="units" />
                  <p className="analytics-note">
                    Lost items are excluded from stock counts and shown in return outcomes above.
                  </p>
                </div>
              </div>
            </>
          )}
        </section>
      );
    }

    return (
      <section className="screen-block">
        <div className="section-header">
          <div>
            <div className="eyebrow">Stationery Borrowing</div>
            <h1>Borrow Requests</h1>
          </div>
          <div className="section-badge">{userProfile.name}</div>
        </div>

        <div className="banner-row">
          <div>
            <strong>Choose stationery and submit it for approval</strong>
            <span>Available stock is only deducted after an admin approves your request.</span>
          </div>
          <div className="banner-meta">
            <span>Checked out to {userProfile.name}</span>
          </div>
        </div>

        <div className="metric-grid">
          <article className="metric-card metric-card--blue">
            <div className="metric-label">Available units</div>
            <div className="metric-value">
              {items.filter((item) => item.category === 'stationery')
                .reduce((total, item) => total + item.quantity, 0)}
            </div>
            <div className="metric-detail">Ready to borrow</div>
          </article>
          <article className="metric-card metric-card--green">
            <div className="metric-label">Stationery types</div>
            <div className="metric-value">
              {items.filter((item) => item.category === 'stationery').length}
            </div>
            <div className="metric-detail">In the catalog</div>
          </article>
          <article className="metric-card metric-card--amber">
            <div className="metric-label">Pending requests</div>
            <div className="metric-value">
              {myBorrowRequests.filter((request) => request.status === 'pending').length}
            </div>
            <div className="metric-detail">Waiting for admin review</div>
          </article>
          <article className="metric-card metric-card--slate">
            <div className="metric-label">Units borrowed</div>
            <div className="metric-value">
              {activeBorrows
                .filter((borrow) => borrow.status !== 'returned')
                .reduce((total, borrow) => total + borrow.quantity, 0)}
            </div>
            <div className="metric-detail">Approved and checked out</div>
          </article>
        </div>

        <nav className="borrow-stepper" aria-label="Borrow request steps">
          <button
            type="button"
            className={`borrow-stepper-step${borrowStep === 1 ? ' is-active' : borrowStep > 1 ? ' is-complete' : ''}`}
            aria-current={borrowStep === 1 ? 'step' : undefined}
            onClick={() => setBorrowStep(1)}
          >
            <span className="borrow-stepper-number">{borrowStep > 1 ? '✓' : '1'}</span>
            <span>
              <strong>Choose items</strong>
              <small>Select stationery and quantities</small>
            </span>
          </button>
          <span className={`borrow-stepper-connector${borrowStep > 1 ? ' is-complete' : ''}`} aria-hidden="true" />
          <button
            type="button"
            className={`borrow-stepper-step${borrowStep === 2 ? ' is-active' : ''}`}
            aria-current={borrowStep === 2 ? 'step' : undefined}
            disabled={Object.keys(borrowCart).length === 0 || editingCartItemId !== null}
            onClick={() => setBorrowStep(2)}
          >
            <span className="borrow-stepper-number">2</span>
            <span>
              <strong>Review request</strong>
              <small>Confirm items, quantity, and due date</small>
            </span>
          </button>
        </nav>

        {itemsError && <p className="inventory-error" role="alert">{itemsError}</p>}
        {itemsMessage && <p className="inventory-success" role="status">{itemsMessage}</p>}

        {borrowStep === 1 && <div className="panel inventory-panel borrow-select-panel">
          <div className="panel-header">
            <div>
              <span className="borrow-step-badge">STEP 1 · CHOOSE ITEMS</span>
              <h3>Available stationery</h3>
              <span className="inventory-count">
                {itemsLoading ? 'Loading inventory…' : `${availableItems.length} status rows available to browse`}
              </span>
              <span className="inventory-count">
                Each status is listed separately. Requests are allocated Worn, then Good, then New.
              </span>
            </div>
            <input
              aria-label="Search stationery"
              className="inventory-search"
              placeholder="Search stationery"
              value={itemSearch}
              onChange={(event) => setItemSearch(event.target.value)}
            />
          </div>

          <div className="inventory-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Available</th>
                  <th>Status</th>
                  <th>Request quantity</th>
                  <th>Add</th>
                </tr>
              </thead>
              <tbody>
                {availableItems.map((item) => (
                  <tr key={`${item.id}-${item.rowCondition}`}>
                    <td>{item.title}</td>
                    <td>
                      <span className={item.rowQuantity > 0 ? 'stock-count' : 'stock-count stock-count--empty'}>
                        {item.rowQuantity}
                      </span>
                    </td>
                    <td>
                      <div className="borrow-stock-statuses">
                        <span
                          className={`borrow-stock-status borrow-stock-status--${item.rowCondition.toLowerCase()}`}
                        >
                          {item.rowCondition}
                        </span>
                      </div>
                    </td>
                    <td>
                      <input
                        aria-label={`Borrow quantity for ${item.title}`}
                        className="borrow-quantity-input"
                        type="number"
                        min="1"
                        max={item.quantity}
                        step="1"
                        value={borrowQuantityDrafts[item.id] ?? '1'}
                        onChange={(event) => setBorrowQuantityDrafts((currentDrafts) => ({
                          ...currentDrafts,
                          [item.id]: event.target.value,
                        }))}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="primary-button compact"
                        disabled={item.quantity < 1}
                        onClick={() => addToBorrowRequest(item)}
                      >
                        Add to request
                      </button>
                    </td>
                  </tr>
                ))}
                {!itemsLoading && availableItems.length === 0 && (
                  <tr>
                    <td colSpan="5">
                      {itemsError
                        ? 'Inventory unavailable.'
                        : filteredItems.length > 0
                          ? 'All matching items are already in your request.'
                          : 'No stationery items found.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="borrow-step-footer">
            <span>
              {Object.keys(borrowCart).length === 0
                ? 'Select at least one item to continue.'
                : `${Object.keys(borrowCart).length} item${Object.keys(borrowCart).length === 1 ? '' : 's'} selected`}
            </span>
            <button
              type="button"
              className="primary-button"
              disabled={Object.keys(borrowCart).length === 0 || editingCartItemId !== null}
              onClick={() => {
                setItemsError('');
                setItemsMessage('');
                setBorrowStep(2);
              }}
            >
              Review request
              <span aria-hidden="true"> →</span>
            </button>
          </div>
        </div>}

        {borrowStep === 2 && <div className="panel borrow-cart-panel">
          <div className="panel-header borrow-cart-header">
            <div className="borrow-cart-heading">
              <span className="borrow-step-badge">STEP 2 · REVIEW</span>
              <h3>Confirm your request</h3>
              <span className="inventory-count">
                Check your selected items and choose when you plan to return them.
              </span>
            </div>
          </div>
          {Object.keys(borrowCart).length === 0 ? (
            <p className="empty-state">Choose items and quantities above, then add them to your request.</p>
          ) : (
            <div className="borrow-cart-list">
              {Object.values(borrowCart).map((requestedItem) => {
                const expectedConditions = getExpectedBorrowConditions(
                  requestedItem.item_id,
                  requestedItem.quantity,
                  items
                );
                return (
                  <div className="borrow-cart-row" key={requestedItem.item_id}>
                      <div className="borrow-cart-item">
                        <strong>{requestedItem.title}</strong>
                        <span>Selected stationery</span>
                        <div className="borrow-cart-statuses">
                          <span className="borrow-cart-status-label">Expected status</span>
                          {expectedConditions.length > 0 ? expectedConditions.map((condition) => (
                            <span
                              className={`borrow-stock-status borrow-stock-status--${condition.toLowerCase()}`}
                              key={condition}
                            >
                              {condition}
                            </span>
                          )) : (
                            <span className="borrow-stock-status borrow-stock-status--unavailable">
                              Not enough stock
                            </span>
                          )}
                        </div>
                      </div>
                      {editingCartItemId === requestedItem.item_id ? (
                        <div className="borrow-cart-edit">
                          <label htmlFor={`cart-quantity-${requestedItem.item_id}`}>Requested quantity</label>
                          <input
                            id={`cart-quantity-${requestedItem.item_id}`}
                            aria-label={`Requested quantity for ${requestedItem.title}`}
                            type="number"
                            min="1"
                            max={items.find((item) => item.id === requestedItem.item_id)?.quantity ?? 0}
                            step="1"
                            value={cartQuantityDraft}
                            onChange={(event) => setCartQuantityDraft(event.target.value)}
                          />
                        </div>
                      ) : (
                        <div className="borrow-cart-quantity">
                          <span>REQUESTED QTY</span>
                          <strong>{requestedItem.quantity}</strong>
                        </div>
                      )}
                      <div className="borrow-cart-actions">
                        {editingCartItemId === requestedItem.item_id ? (
                          <>
                            <button
                              type="button"
                              className="primary-button compact"
                              onClick={() => confirmCartQuantity(requestedItem)}
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              className="secondary-button compact"
                              onClick={cancelEditingCartItem}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="borrow-cart-icon-button"
                              disabled={editingCartItemId !== null}
                              aria-label={`Edit quantity for ${requestedItem.title}`}
                              title="Edit quantity"
                              onClick={() => startEditingCartItem(requestedItem)}
                            >
                              <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M12 20h9" />
                                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              className="borrow-cart-icon-button borrow-cart-icon-button--remove"
                              disabled={editingCartItemId !== null}
                              aria-label={`Remove ${requestedItem.title} from request`}
                              title="Remove from request"
                              onClick={() => setBorrowCart((currentCart) => {
                                const nextCart = { ...currentCart };
                                delete nextCart[requestedItem.item_id];
                                return nextCart;
                              })}
                            >
                              <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M3 6h18" />
                                <path d="M8 6V4h8v2" />
                                <path d="m19 6-1 14H6L5 6" />
                                <path d="M10 11v5M14 11v5" />
                              </svg>
                            </button>
                          </>
                        )}
                      </div>
                  </div>
                );
              })}
            </div>
          )}
          {Object.keys(borrowCart).length > 0 && (
            <div className="borrow-review-footer">
              <label className="borrow-due-date-field" htmlFor="borrow-request-due-date">
                <span>Due date <strong>Required</strong></span>
                <input
                  id="borrow-request-due-date"
                  type="date"
                  min={getLocalDateInputValue()}
                  value={borrowDueDate}
                  onChange={(event) => setBorrowDueDate(event.target.value)}
                  required
                />
              </label>
              <div className="borrow-review-actions">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={isSubmittingRequest || editingCartItemId !== null}
                  onClick={() => {
                    setItemsError('');
                    setItemsMessage('');
                    setBorrowStep(1);
                  }}
                >
                  Back to items
                </button>
                <button
                  type="button"
                  className="primary-button"
                  disabled={
                    isSubmittingRequest
                    || Object.keys(borrowCart).length === 0
                    || editingCartItemId !== null
                    || !borrowDueDate
                  }
                  onClick={submitBorrowRequest}
                >
                  {isSubmittingRequest ? 'Submitting…' : 'Confirm & send request'}
                </button>
              </div>
            </div>
          )}
        </div>}

        <div className="panel borrow-history-panel">
          <div className="panel-header">
            <div>
              <h3>My borrow requests</h3>
              <span className="inventory-count">Track pending, approved, and rejected requests.</span>
            </div>
          </div>
          <div className="inventory-table-wrap">
            <table className="data-table borrow-requests-table">
              <thead>
                <tr>
                  <th>Request</th>
                  <th>Submitted</th>
                  <th>Due date</th>
                  <th>Item status</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {borrowRequestsWithLoans.map((request) => {
                  const isExpanded = expandedBorrowRequestIds.includes(request.id);
                  const outcomeSummary = [
                    request.onUseCount ? `${request.onUseCount} on use` : '',
                    request.returnedCount ? `${request.returnedCount} returned` : '',
                    request.brokenCount ? `${request.brokenCount} broken` : '',
                    request.lostCount ? `${request.lostCount} lost` : '',
                  ].filter(Boolean).join(' · ');
                  const requestStatus = request.status !== 'approved'
                    ? request.status
                    : outcomeSummary || 'Approved';
                  const statusTone = request.status === 'rejected'
                    ? 'red'
                    : request.status === 'pending'
                      ? 'amber'
                      : request.onUseCount > 0
                        ? 'blue'
                        : request.brokenCount > 0 || request.lostCount > 0
                          ? 'red'
                          : request.returnedCount > 0
                        ? 'green'
                        : 'blue';
                  return (
                    <Fragment key={request.id}>
                      <tr>
                        <td><strong>Request #{request.id}</strong></td>
                        <td>{new Date(request.created_at).toLocaleString()}</td>
                        <td>{formatDueDate(request.due_date)}</td>
                        <td>
                          <span className={`status-pill status-pill--${statusTone}`}>
                            {requestStatus}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="secondary-button compact"
                            aria-expanded={isExpanded}
                            onClick={() => setExpandedBorrowRequestIds((currentIds) => isExpanded
                              ? currentIds.filter((id) => id !== request.id)
                              : [...currentIds, request.id])}
                          >
                            {isExpanded ? 'Hide items' : 'View items'}
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="borrow-request-detail-row">
                          <td colSpan="5">
                            <ul className="borrow-request-items">
                              {request.itemsWithStatus.map((item) => (
                                <li key={item.item_id}>
                                  <span>{item.item_title}</span>
                                  <strong>× {item.quantity}</strong>
                                  {(() => {
                                    const itemStatus = item.loans.some((loan) => loan.status === 'return_requested')
                                      ? 'Awaiting confirmation'
                                      : item.loans.some((loan) => loan.status === 'checked_out')
                                        ? 'On use'
                                        : item.loans.some((loan) => loan.return_condition === 'lost')
                                          ? 'Lost'
                                          : item.loans.some((loan) => loan.return_condition === 'broken')
                                            ? 'Returned broken'
                                        : item.loans.some((loan) => loan.status === 'returned')
                                          ? 'Already Returned'
                                          : request.status === 'pending'
                                            ? 'Pending approval'
                                            : request.status === 'rejected'
                                              ? 'Not approved'
                                              : 'Status unavailable';
                                    const itemTone = itemStatus === 'Already Returned'
                                      ? 'green'
                                      : itemStatus === 'Returned broken' || itemStatus === 'Lost'
                                        ? 'red'
                                      : itemStatus === 'Awaiting confirmation' || itemStatus === 'Pending approval'
                                        ? 'amber'
                                        : itemStatus === 'On use'
                                          ? 'blue'
                                          : 'slate';
                                    return <span className={`status-pill status-pill--${itemTone}`}>{itemStatus}</span>;
                                  })()}
                                </li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {!itemsLoading && myBorrowRequests.length === 0 && (
                  <tr><td colSpan="5">You have not submitted any borrow requests yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {!itemsLoading && myBorrowRequests.length === 0 && (
          <p className="empty-state">You have no borrow requests yet.</p>
        )}
      </section>
    );
  };

  if (authLoading) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="brand-mark" aria-hidden="true">FT</div>
          <h1>FreeTime</h1>
          <p>Checking your sign-in…</p>
        </div>
      </div>
    );
  }

  if (!authUser) {
    return (
      <div className="auth-screen">
        <form className="auth-card" onSubmit={submitLogin}>
          <div className="brand-mark" aria-hidden="true">FT</div>
          <div className="eyebrow">Stationery borrowing</div>
          <h1>Welcome back</h1>
          <p>Sign in with the account provided by your administrator.</p>
          {loginError && <p className="inventory-error" role="alert">{loginError}</p>}
          <label>
            Username
            <input
              autoComplete="username"
              maxLength="80"
              required
              value={loginUsername}
              onChange={(event) => setLoginUsername(event.target.value)}
            />
          </label>
          <label>
            Password
            <input
              autoComplete="current-password"
              required
              type="password"
              value={loginPassword}
              onChange={(event) => setLoginPassword(event.target.value)}
            />
          </label>
          <button className="primary-button wide" type="submit" disabled={loginSubmitting}>
            {loginSubmitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="opsflow-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true">FT</div>
          <div className="brand-copy">
            <div className="eyebrow">Description</div>
            <h2>FreeTime</h2>
          </div>
        </div>

        <nav className="nav">
          {ROLE_PAGES[authUser.role].map((item) => (
            <button
              key={item}
              className={item === activePage ? 'nav-item active' : 'nav-item'}
              type="button"
              onClick={() => setActivePage(item)}
            >
              {item}
            </button>
          ))}
        </nav>

        <div className="sidebar-account">
          <button
            className="notification-button"
            type="button"
            aria-label="Open notifications"
            onClick={() => {
              setUnreadDecisionIds([]);
              setRequestNotificationsOpen(true);
            }}
          >
            <span className="sidebar-action-label">
              <BellIcon />
              <span>Notifications</span>
            </span>
            {(authUser.role === 'user'
              ? unreadDecisionIds.length
              : pendingNotificationRequests.length + (authUser.role === 'dev_user' ? unreadDecisionIds.length : 0)) > 0 && (
              <span className="notification-count">
                {authUser.role === 'user'
                  ? unreadDecisionIds.length
                  : pendingNotificationRequests.length + (authUser.role === 'dev_user' ? unreadDecisionIds.length : 0)}
              </span>
            )}
          </button>
          <div className="profile-tag profile-tag--sidebar">
            <div className="avatar">
              {authUser.display_name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}
            </div>
            <div>
              <strong>{userProfile.name}</strong>
              <small>{userProfile.role}</small>
            </div>
            <button type="button" className="logout-button" onClick={logout} aria-label="Log out" title="Log out">
              <LogoutIcon />
            </button>
          </div>
        </div>
      </aside>

      <main className="app-content">
        {renderPage()}
      </main>
      {requestNotificationsOpen && (
        <div className="modal-backdrop" role="presentation" onClick={(event) => {
          if (event.target === event.currentTarget) setRequestNotificationsOpen(false);
        }}>
          <section className="notification-modal" role="dialog" aria-modal="true" aria-labelledby="notification-title">
            <div className="panel-header">
              <div>
                <h2 id="notification-title">Request updates</h2>
                <span className="inventory-count">
                  {authUser.role === 'user'
                    ? 'Admin decisions on your borrow requests'
                    : 'New borrow requests awaiting review'}
                </span>
              </div>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setRequestNotificationsOpen(false)}
              >
                Close
              </button>
            </div>
            {notificationError && <p className="inventory-error" role="alert">{notificationError}</p>}
            {(authUser.role === 'user' || authUser.role === 'dev_user') && (
              <section className="notification-section">
                {authUser.role === 'dev_user' && <h3>Your request decisions</h3>}
                {myBorrowRequests.filter((request) => request.status !== 'pending').length === 0 ? (
                  <p className="empty-state">No request decisions yet. Updates will appear here.</p>
                ) : (
                  <div className="notification-list">
                    {myBorrowRequests
                      .filter((request) => request.status !== 'pending')
                      .map((request) => (
                        <article key={request.id} className={`notification-item notification-item--${request.status}`}>
                          <div>
                            <strong>Request #{request.id} {request.status}</strong>
                            <span>
                              {request.status === 'approved'
                                ? 'Your request was approved. The items are ready for use.'
                                : 'Your request was not approved. Contact the administrator for details.'}
                            </span>
                          </div>
                          <time>{request.reviewed_at ? new Date(request.reviewed_at).toLocaleString() : ''}</time>
                        </article>
                      ))}
                  </div>
                )}
              </section>
            )}
            {(authUser.role === 'admin' || authUser.role === 'dev_user') && (
              <section className="notification-section">
                {authUser.role === 'dev_user' && <h3>Requests awaiting review</h3>}
                {pendingNotificationRequests.length === 0 ? (
                  <p className="empty-state">No new borrow requests are waiting for review.</p>
                ) : (
                  <div className="notification-list">
                    {pendingNotificationRequests.map((request) => (
                      <article key={request.id} className="notification-item notification-item--pending">
                        <div>
                          <strong>New request #{request.id} from {request.borrower_name}</strong>
                          <span>
                            {request.items.map((item) => `${item.quantity} × ${item.item_title}`).join(', ')}
                          </span>
                        </div>
                        <time>{new Date(request.created_at).toLocaleString()}</time>
                      </article>
                    ))}
                    <button
                      className="primary-button"
                      type="button"
                      onClick={() => {
                        setRequestNotificationsOpen(false);
                        setActivePage('Approval Request');
                      }}
                    >
                      Review requests
                    </button>
                  </div>
                )}
              </section>
            )}
          </section>
        </div>
      )}
      {decisionPopup && (
        <div className="modal-backdrop" role="presentation">
          <section className="decision-popup" role="dialog" aria-modal="true" aria-labelledby="decision-popup-title">
            <div className={`decision-popup-icon decision-popup-icon--${decisionPopup.status}`}>
              {decisionPopup.status === 'approved' ? '✓' : '!'}
            </div>
            <h2 id="decision-popup-title">
              Request #{decisionPopup.id} {decisionPopup.status}
            </h2>
            <p>
              {decisionPopup.status === 'approved'
                ? 'The admin approved your borrow request.'
                : 'The admin rejected your borrow request.'}
            </p>
            <button className="primary-button" type="button" onClick={() => setDecisionPopup(null)}>
              Got it
            </button>
          </section>
        </div>
      )}
      {requestSentPopup && (
        <div className="modal-backdrop" role="presentation">
          <section className="decision-popup" role="dialog" aria-modal="true" aria-labelledby="request-sent-title">
            <div className="decision-popup-icon">✓</div>
            <h2 id="request-sent-title">Request sent successfully</h2>
            <p>
              Request #{requestSentPopup.id} was sent to the admin for review. Stock will update after approval.
            </p>
            <button className="primary-button" type="button" onClick={() => setRequestSentPopup(null)}>
              Got it
            </button>
          </section>
        </div>
      )}
      {returnDecisionConfirmation && (
        <div className="modal-backdrop" role="presentation">
          <section
            className={`decision-popup return-decision-dialog return-decision-dialog--${returnDecisionConfirmation.status}`}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="return-decision-title"
            aria-describedby="return-decision-description"
          >
            <div className={`decision-popup-icon decision-popup-icon--${returnDecisionConfirmation.status}`}>
              {returnDecisionConfirmation.status === 'broken' ? '!' : '×'}
            </div>
            <h2 id="return-decision-title">
              Mark item as {returnDecisionConfirmation.status}?
            </h2>
            <p id="return-decision-description">
              Record {returnDecisionConfirmation.borrow.item_title} × {returnDecisionConfirmation.borrow.quantity}
              {' '}as {returnDecisionConfirmation.status}? This will remove it from available stock.
            </p>
            <div className="return-decision-actions">
              <button
                className="secondary-button"
                type="button"
                disabled={reviewingReturnId === returnDecisionConfirmation.borrow.id}
                onClick={() => setReturnDecisionConfirmation(null)}
              >
                Cancel
              </button>
              <button
                className={returnDecisionConfirmation.status === 'lost' ? 'danger-button' : 'primary-button'}
                type="button"
                disabled={reviewingReturnId === returnDecisionConfirmation.borrow.id}
                onClick={async () => {
                  const { borrow, status } = returnDecisionConfirmation;
                  await reviewBorrowReturn(borrow, status);
                  setReturnDecisionConfirmation(null);
                }}
              >
                {reviewingReturnId === returnDecisionConfirmation.borrow.id
                  ? 'Saving…'
                  : `Confirm ${returnDecisionConfirmation.status}`}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}