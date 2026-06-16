document.addEventListener('DOMContentLoaded', () => {
    const uploadForm = document.getElementById('uploadForm');
    const rawTableWrapper = document.getElementById('rawTableWrapper');
    const filteredTableWrapper = document.getElementById('filteredTableWrapper');
    const rawContainer = document.getElementById('rawContainer');
    const filteredContainer = document.getElementById('filteredContainer');
    const showRawBtn = document.getElementById('showRawBtn');
    const showFilteredBtn = document.getElementById('showFilteredBtn');
    const debug = document.getElementById('debug');
    const filteredSummary = document.getElementById('filteredSummary');
    const showParticularsBtn = document.getElementById('showParticularsBtn');
    const particularsContainer = document.getElementById('particularsContainer');
    const particularsTableWrapper = document.getElementById('particularsTableWrapper');


    let lastRawArrays = null;
    let lastHeaderRowIndex = null;
    let lastHeaders = null;
    let lastRawRows = null;      // array of objects keyed by headers
    let lastFilteredRows = null; // array of mapped objects

    

    uploadForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(uploadForm);
      showRawBtn.disabled = true;
      showFilteredBtn.disabled = true;
      showParticularsBtn.disabled = true;
      rawTableWrapper.innerHTML = '<p class="loading">Loading full sheet...</p>';
      filteredTableWrapper.innerHTML = '<p class="loading">Loading filtered view...</p>';
      debug.innerHTML = '';

      try {
        const res = await fetch('/upload-excel', { method: 'POST', body: fd });
        const data = await res.json();

        if (!res.ok) {
          rawTableWrapper.innerHTML = `<pre>${data.error || 'Upload failed'}</pre>`;
          filteredTableWrapper.innerHTML = '';
          return;
        }

        // Defensive checks
        if (!data.rawArrays || !Array.isArray(data.rawArrays)) {
          rawTableWrapper.innerHTML = '<p>Error: server did not return rawArrays as an array. Check server logs.</p>';
          filteredTableWrapper.innerHTML = '';
          return;
        }
        
        

        lastRawArrays = data.rawArrays;

        // Detect header row and build header names + rawRows (objects)
        const detection = detectHeaderAndBuildRows(lastRawArrays);
        lastHeaderRowIndex = detection.headerRowIndex;
        lastHeaders = detection.headers;
        lastRawRows = detection.rawRows;

        // Build filtered rows using the same mapping logic as backend
        lastFilteredRows = buildFilteredRowsFromArrays(lastRawArrays, lastHeaderRowIndex, lastHeaders);

        // Render both
        renderFullSheet(lastRawArrays, lastHeaderRowIndex);
       
        
        lastFilteredRows.sort((a, b) => {
          const d1 = new Date(a.Order_Settled_Time);
          const d2 = new Date(b.Order_Settled_Time);
          return d2 - d1;
        });

        renderFilteredTable(lastFilteredRows);
        // const grouped = groupByDateGrossLimit(lastFilteredRows, 500);
        // renderParticularsView(grouped);

        // Debug info
        debug.innerHTML = `<pre>sheetName: ${data.sheetName}\nrowCount: ${data.rowCount}\nheaderRowIndex: ${lastHeaderRowIndex}\nheaders: ${JSON.stringify(lastHeaders)}</pre>`;

        // Enable toggles and show default view
        showRawBtn.disabled = false;
        showFilteredBtn.disabled = false;
        showParticularsBtn.disabled = false
        showRaw();
      } catch (err) {
        console.error(err);
        rawTableWrapper.innerHTML = `<pre>${err.message}</pre>`;
        filteredTableWrapper.innerHTML = '';
      }
    });

    showRawBtn.addEventListener('click', showRaw);
    showFilteredBtn.addEventListener('click', showFiltered);
    
    
    showParticularsBtn.addEventListener('click', () => {

      if (!lastFilteredRows) return;
      const grouped = groupByDateGrossLimit(lastFilteredRows, 500);
      renderParticularsView(grouped);
      renderDateSummary(grouped);
    
      window.addEventListener('scroll', syncSummaryWithScroll);
      rawContainer.style.display = 'none';
      filteredContainer.style.display = 'none';
      particularsContainer.style.display = 'block';
    });


    function showRaw() {
      rawContainer.style.display = 'block';
      filteredContainer.style.display = 'none';
      particularsContainer.style.display = 'none';
    }
    function showFiltered() {
      rawContainer.style.display = 'none';
      filteredContainer.style.display = 'block';
      particularsContainer.style.display = 'none';
    }


    function detectHeaderAndBuildRows(rawArrays) {
  let headerRowIndex = -1;

  const keywords = [
    'order/adjustment id',
    'total revenue',
    'transaction type',
    'order id',
    'adjustment id'
  ];

  for (let i = 0; i < rawArrays.length; i++) {
    const row = rawArrays[i] || [];
    const rowStr = row.join('|').toLowerCase();

    if (keywords.some(k => rowStr.includes(k))) {
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex === -1) headerRowIndex = 0;

  const headerRow = (rawArrays[headerRowIndex] || []).map(h =>
    h ? String(h).trim() : ''
  );

  const dataArrays = rawArrays.slice(headerRowIndex + 1);

  const rawRows = dataArrays.map(row => {
    const obj = {};

    headerRow.forEach((h, i) => {
      obj[h || `Column${i}`] = row?.[i] ?? '';
    });

    return obj;
  });

  return { headerRowIndex, headers: headerRow, rawRows };
}

    // -------------------------
    // Header detection + rawRows builder
    // -------------------------
    function buildFilteredRowsFromArrays(rawArrays, headerRowIndex, headers) {

  const lowerHeaders = headers.map(h => String(h).toLowerCase());

  const colIdxOrderID = lowerHeaders.findIndex(cell =>
    cell.includes('order/adjustment id') ||
    cell.includes('order id') ||
    cell.includes('adjustment id')
  );

  const colIdxTxType = lowerHeaders.findIndex(cell => cell.includes('transaction type'));
  const colIdxSettle = lowerHeaders.findIndex(cell => cell.includes('settle amount'));
  const colIdxRevenue = lowerHeaders.findIndex(cell => cell.includes('total revenue'));
  const colIdxFees = lowerHeaders.findIndex(cell => cell.includes('total fees'));
  const colIdxSettledTime = lowerHeaders.findIndex(cell =>
    cell.includes('settled time') || cell.includes('order settled')
  );
  

  const idxA = colIdxOrderID !== -1 ? colIdxOrderID : 0;
  const idxB = colIdxTxType !== -1 ? colIdxTxType : 1;
  const idxF = colIdxSettle !== -1 ? colIdxSettle : 5;
  const idxG = colIdxRevenue !== -1 ? colIdxRevenue : 6;
  const idxN = colIdxFees !== -1 ? colIdxFees : 13;
  const idxSettledTime = colIdxSettledTime !== -1 ? colIdxSettledTime : 3;
  

  const dataArrays = rawArrays.slice(headerRowIndex + 1);

  const safeNum = v => {
    if (!v) return 0;
    let s = String(v).trim();
    const isParen = /^\(.*\)$/.test(s);
    s = s.replace(/[,\s]/g, '').replace(/[()]/g, '');
    const n = Number(s);
    if (!Number.isFinite(n)) return 0;
    return isParen ? -Math.abs(n) : n;
  };

  const filteredRows = dataArrays
    
    .filter(row => {
      if (!row || row[idxA] === undefined) return false;

      const gross = safeNum(row[idxG]);
      const cash = safeNum(row[idxF]);
      const hasValue = gross !== 0 || cash !== 0;
      // const hasValue = gross !== 0;
      return String(row[idxA]).trim() !== '' && hasValue;
    })

    .map(row => {

      const transactionType = String(row[idxB] || '').trim().toLowerCase();
      const isWithholding = transactionType.includes('withholding');

      let grossSales = safeNum(row[idxG]);
      // let cashVal = safeNum(row[idxF]);
      // let withholdingVal = isWithholding ? safeNum(row[idxF]) : 0;
      let rawCash = safeNum(row[idxF]);

      let cashVal = 0;
      let withholdingVal = 0;
      if (isWithholding) {

        withholdingVal = rawCash;
      } else {
        cashVal = rawCash;
      }
      console.log({
          type:transactionType,
          rawCash,
          cashVal,
          withholdingVal
        });
      return {
        Order_ID: String(row[idxA] || 'N/A').trim(),
        Gross_Sales: grossSales,
        Withholding_Tax: withholdingVal,
        Total_Platform_Fee: safeNum(row[idxN]),
        Cash: cashVal,
        Order_Settled_Time: formatDateTime(row[idxSettledTime]) || ''
      };
    });

  return filteredRows;
}


    //--------------------------
    //GROUPING
    //--------------------------
    function groupByDateGrossLimit(rows, limit = 500) {
      if (!rows || !Array.isArray(rows)) return [];
  const result = {};

  // Group by date
  rows.forEach(r => {
    const date = r.Order_Settled_Time || 'No Date';
    if (!result[date]) result[date] = [];
    result[date].push(r);
  });

  const finalGroups = [];

  Object.keys(result).forEach(date => {
    let batch = [];
    let total = 0;

    result[date].forEach(r => {
      const value = Number(r.Gross_Sales || 0);

      if (total + value > limit && batch.length > 0) {
        finalGroups.push({ date, rows: batch });
        batch = [];
        total = 0;
      }

      batch.push(r);
      total += value;
    });

    if (batch.length > 0) {
      finalGroups.push({ date, rows: batch });
    }
  });

  return finalGroups;
}
    // -------------------------
    // Renderers
    // -------------------------
    function renderFullSheet(rows, headerRowIndex = null) {
      rawTableWrapper.innerHTML = '';
      if (!rows || !rows.length) {
        rawTableWrapper.innerHTML = '<p>No data found.</p>';
        return;
      }

      // Normalize rows to arrays
      const normalized = rows.map(r => Array.isArray(r) ? r : Object.values(r));

      // Determine max columns across all rows
      const maxCols = Math.max(...normalized.map(r => r ? r.length : 0));

      const table = document.createElement('table');

      // Column header (Col 1, Col 2, ...)
      const thead = document.createElement('thead');
      const trh = document.createElement('tr');
      for (let c = 0; c < maxCols; c++) {
        const th = document.createElement('th');
        th.textContent = `Col ${c + 1}`;
        trh.appendChild(th);
      }
      thead.appendChild(trh);
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      normalized.forEach((rowArr, rowIndex) => {
        const tr = document.createElement('tr');

        // Highlight detected header row visually
        if (headerRowIndex !== null && rowIndex === headerRowIndex) {
          tr.classList.add('highlight-header');
        }

        for (let c = 0; c < maxCols; c++) {
          const td = document.createElement('td');
          const val = (rowArr && rowArr[c] !== undefined && rowArr[c] !== null) ? rowArr[c] : '';
          td.textContent = val;
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      });

      table.appendChild(tbody);
      rawTableWrapper.appendChild(table);
    }

    function renderFilteredTable(rows) {
      filteredTableWrapper.innerHTML = '';
      filteredSummary.innerHTML = '';

      if (!rows || !rows.length) {
        filteredTableWrapper.innerHTML = '<p>No filtered rows found.</p>';
        return;
      }

      const keys = Object.keys(rows[0]);
      const table = document.createElement('table');
      const thead = document.createElement('thead');
      const trh = document.createElement('tr');
      keys.forEach(k => {
        const th = document.createElement('th');
        th.textContent = k;
        trh.appendChild(th);
      });
      thead.appendChild(trh);
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      rows.forEach(row => {
        const tr = document.createElement('tr');
        keys.forEach(k => {
          const td = document.createElement('td');
          td.textContent = row[k];
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      filteredTableWrapper.appendChild(table);

      // Summary totals
      const totals = rows.reduce((acc, r) => {
      acc.grossSales += Number(r.Gross_Sales || 0);
      acc.withholdingTax += Number(r.Withholding_Tax || 0);
      acc.totalPlatformFee += Number(r.Total_Platform_Fee || 0);
      acc.cash += Number(r.Cash || 0);
        return acc;
      }, { grossSales: 0, withholdingTax: 0, totalPlatformFee: 0, cash: 0 });

      filteredSummary.innerHTML = `
        <strong>Filtered summary</strong>
        &nbsp;•&nbsp; Rows: ${rows.length}
        &nbsp;•&nbsp; Gross Sales: ${formatNumber(totals.grossSales)}
        &nbsp;•&nbsp; Withholding Tax: ${formatNumber(totals.withholdingTax)}
        &nbsp;•&nbsp; Platform Fee: ${formatNumber(totals.totalPlatformFee)}
        &nbsp;•&nbsp; Cash: ${formatNumber(totals.cash)}
      `;
    }
    //-----------------------------
    //RENDER FOR GROUPING
    //-----------------------------
    
function renderParticularsView(groups) {
  // const container = document.getElementById('filteredTableWrapper');
  const dateTotals = computeDateTotals(groups);
  const container = particularsTableWrapper;
  container.innerHTML = '';
  
    if (!groups || groups.length === 0) {
      container.innerHTML = "<p>No grouped data found.</p>";
    return;
    }
  groups.forEach((group, index) => {

    const wrapper = document.createElement('div');
    wrapper.style.marginBottom = '20px';

    // ✅ FIXED date display
    const dateTotalCash = dateTotals[group.date].cash;
    const totalWHT = dateTotals[group.date].withholding;
    const netCash = dateTotalCash + totalWHT;

    const title = document.createElement('h4');
            title.setAttribute('data-date', group.date);
            title.className = 'date-hover';
            title.innerHTML = `
            Date: ${group.date} | Group ${index + 1}
            <div class="tooltip">
                Total Cash: ${formatNumber(dateTotalCash)}<br>
                Withholding: ${formatNumber(totalWHT)}<br>
                Net Cash: ${formatNumber(netCash)}
            </div>
            `;


    wrapper.appendChild(title);

    const table = document.createElement('table');

    const thead = document.createElement('thead');
    thead.innerHTML = `
      <tr>
        <th>Order ID</th>
        <th>Gross Sales</th>
        <th>Total Platform Fee</th>
        <th>WithHolding Tax</th>
        <th>Cash</th>

      </tr>
    `;
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    let totalGross = 0;
    let totalCash = 0;
    let totalWithholding = 0;
    let totalPlatformFee = 0;

    // ✅ IMPORTANT: loop correctly
    (group.rows || []).forEach(r => {

      const tr = document.createElement('tr');

      const orderId = r.Order_ID || '';
      const gross = Number(r.Gross_Sales || 0);
      const cash = Number(r.Cash || 0);
      const withholding = Number(r.Withholding_Tax || 0);
      const platform = Number(r.Total_Platform_Fee || 0);
      
      totalGross += gross;
      totalCash += cash;
      totalWithholding += withholding;
      totalPlatformFee += platform;

      tr.innerHTML = `
        <td>${orderId}</td>
        <td>${formatNumber(gross)}</td>
        <td>${formatNumber(platform)}</td>
        <td style="color:red">${formatNumber(withholding)}</td>
        <td>${formatNumber(cash)}</td>
      `;

      tbody.appendChild(tr);
    });

    // ✅ TOTAL ROW
    const totalRow = document.createElement('tr');
    const adjustedCash = totalCash + totalWithholding;
    totalRow.innerHTML = `
      <td><strong>Total</strong></td>
      <td><strong>${totalGross.toFixed(2)}</strong></td>
      <td><strong>${totalPlatformFee.toFixed(2)}</strong></td>
      <td style="color:red"><strong>${totalWithholding.toFixed(2)}</strong></td>
      <td>
          <strong>${adjustedCash.toFixed(2)}</strong>
           <br>
           <small>(Cash: ${totalCash.toFixed(2)}, WHT: ${totalWithholding.toFixed(2)})</small>
      </td>
    `;
    tbody.appendChild(totalRow);

    table.appendChild(tbody);
    wrapper.appendChild(table);
    container.appendChild(wrapper);
        });
    }

    function renderDateSummary(groups) {
  const container = document.getElementById('dateSummaryContent');
  container.innerHTML = '';

  const totals = computeDateTotals(groups);

  Object.keys(totals).forEach(date => {
    const cash = totals[date].cash;
    const wht = totals[date].withholding;
    const net = cash + wht;

    const div = document.createElement('div');
    div.className = 'date-summary-item';
    div.setAttribute('data-date-summary', date);
    div.innerHTML = `
      <strong>${date}</strong>
      Gross: ${formatNumber(cash)}<br>
      <span class="wht">WHT: ${formatNumber(wht)}</span><br>
       Cash: ${formatNumber(net)}
    `;

    container.appendChild(div);
  });
}
  
    // -------------------------
    // Helpers
    // -------------------------
    function formatNumber(n) {
      if (n === null || n === undefined) return '0';
      return Number(n).toLocaleString(undefined, { 
        maximumFractionDigits: 2,
        minimumFractionDigits: 2 
      });
    }
    function formatDateTime(v) {
      if (!v) return '';
      const d = new Date(v);
      if (isNaN(d)) return v;
      return d.toLocaleDateString();
    }
    function computeDateTotals(groups) {
        const dateTotals = {};

        groups.forEach(group => {
            if (!dateTotals[group.date]) {
            dateTotals[group.date] = {
                cash: 0,
                withholding: 0
            };
            }

            group.rows.forEach(r => {
            dateTotals[group.date].cash += Number(r.Cash || 0);
            dateTotals[group.date].withholding += Number(r.Withholding_Tax || 0);
            });
        });

        return dateTotals;
        }
    function syncSummaryWithScroll() {
    const dateHeaders = document.querySelectorAll('[data-date]');
    const summaryItems = document.querySelectorAll('[data-date-summary]');

    let currentDate = null;

    dateHeaders.forEach(header => {
    const rect = header.getBoundingClientRect();

    if (rect.top <= 150) {
      currentDate = header.getAttribute('data-date');
        }
    });

    summaryItems.forEach(item => {
    item.style.background = '';
    item.style.fontWeight = '';
  });

    if (currentDate) {
    const active = document.querySelector(
      `[data-date-summary="${currentDate}"]`
    );

    if (active) {
        active.style.background = '#e9f5ff';
        active.style.fontWeight = 'bold';
      
        active.scrollIntoView({
        block: 'nearest'
        });

    }
  }
}
//   window.addEventListener('scroll', syncSummaryWithScroll);
    });