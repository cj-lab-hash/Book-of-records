document.addEventListener('DOMContentLoaded', () => {

  const uploadForm = document.getElementById('uploadForm');
  const rawTableWrapper = document.getElementById('rawTableWrapper');
  const filteredTableWrapper = document.getElementById('filteredTableWrapper');
  const rawContainer = document.getElementById('rawContainer');
  const filteredContainer = document.getElementById('filteredContainer');
  const showRawBtn = document.getElementById('showRawBtn');
  const showFilteredBtn = document.getElementById('showFilteredBtn');
  const showParticularsBtn = document.getElementById('showParticularsBtn');
  const particularsContainer = document.getElementById('particularsContainer');
  const particularsTableWrapper = document.getElementById('particularsTableWrapper');
  const debug = document.getElementById('debug');
  const filteredSummary = document.getElementById('filteredSummary');

  let lastFilteredRows = null;

  uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const fd = new FormData(uploadForm);

    rawTableWrapper.innerHTML = 'Loading...';
    filteredTableWrapper.innerHTML = 'Loading...';

    try {
      const res = await fetch('/upload-excel', {
        method: 'POST',
        body: fd
      });

      const data = await res.json();

      const detection = detectHeaderAndBuildRows(data.rawArrays);

      lastFilteredRows = buildFilteredRowsFromArrays(
        data.rawArrays,
        detection.headerRowIndex,
        detection.headers
      );

      lastFilteredRows.sort((a, b) =>
        new Date(b.Order_Settled_Time) - new Date(a.Order_Settled_Time)
      );

      renderFullSheet(data.rawArrays, detection.headerRowIndex);
      renderFilteredTable(lastFilteredRows);

      showRaw();

      showRawBtn.disabled = false;
      showFilteredBtn.disabled = false;
      showParticularsBtn.disabled = false;

    } catch (err) {
      console.error(err);
    }
  });

  showRawBtn.onclick = showRaw;
  showFilteredBtn.onclick = showFiltered;

  showParticularsBtn.onclick = () => {

    const grouped = groupByDateGrossLimit(lastFilteredRows, 500);

    renderParticularsView(grouped);
    renderDateSummary(grouped);

    // ✅ FIX duplicate listener
    window.removeEventListener('scroll', syncSummaryWithScroll);
    window.addEventListener('scroll', syncSummaryWithScroll);

    rawContainer.style.display = 'none';
    filteredContainer.style.display = 'none';
    particularsContainer.style.display = 'block';
  };

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
    const headers = rawArrays[0];
    return {
      headerRowIndex: 0,
      headers
    };
  }

  function buildFilteredRowsFromArrays(rawArrays, headerRowIndex, headers) {

    return rawArrays.slice(1).map(row => {

      const rawCash = Number(row[5] || 0);
      const type = String(row[1] || '').toLowerCase();

      let cash = 0;
      let withholding = 0;

      if (type.includes('withholding')) {
        withholding = rawCash;
      } else {
        cash = rawCash;
      }

      return {
        Order_ID: row[0],
        Gross_Sales: Number(row[6] || 0),
        Withholding_Tax: withholding,
        Total_Platform_Fee: Number(row[13] || 0),
        Cash: cash,
        Order_Settled_Time: formatDateTime(row[3])
      };
    });
  }

  function groupByDateGrossLimit(rows, limit = 500) {

    const result = {};

    rows.forEach(r => {
      const date = r.Order_Settled_Time;
      result[date] = result[date] || [];
      result[date].push(r);
    });

    const finalGroups = [];

    Object.keys(result).forEach(date => {

      let batch = [];
      let total = 0;

      result[date].forEach(r => {

        if (total + r.Gross_Sales > limit && batch.length > 0) {
          finalGroups.push({ date, rows: batch });
          batch = [];
          total = 0;
        }

        batch.push(r);
        total += r.Gross_Sales;

      });

      if (batch.length) finalGroups.push({ date, rows: batch });
    });

    return finalGroups;
  }

  function renderParticularsView(groups) {

    const totals = computeDateTotals(groups);
    const container = particularsTableWrapper;
    container.innerHTML = '';

    let currentDate = null;
    let dateWrapper;

    groups.forEach(group => {

      if (group.date !== currentDate) {
        currentDate = group.date;

        dateWrapper = document.createElement('div');

        const header = document.createElement('h3');
        header.textContent = group.date;
        header.setAttribute('data-date-anchor', group.date);

        header.onclick = () => {
          document.querySelectorAll('.date-group-content')
            .forEach(el => el.style.display = 'none');

          content.style.display = 'block';
        };

        const content = document.createElement('div');
        content.className = 'date-group-content';
        content.style.display = 'none';

        dateWrapper.appendChild(header);
        dateWrapper.appendChild(content);
        container.appendChild(dateWrapper);
      }

      const content = dateWrapper.querySelector('.date-group-content');

      const wrapper = document.createElement('div');

      const title = document.createElement('h4');
      title.setAttribute('data-date', group.date);
      title.innerText = `Group`;

      const table = document.createElement('table');

      const tbody = document.createElement('tbody');

      group.rows.forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${r.Order_ID}</td>
          <td>${r.Gross_Sales}</td>
          <td>${r.Total_Platform_Fee}</td>
          <td>${r.Withholding_Tax}</td>
          <td>${r.Cash}</td>
        `;
        tbody.appendChild(tr);
      });

      table.appendChild(tbody);

      const wrapperDiv = document.createElement('div');
      wrapperDiv.className = 'table-wrapper';
      wrapperDiv.appendChild(table);

      wrapper.appendChild(title);
      wrapper.appendChild(wrapperDiv);

      content.appendChild(wrapper);
    });

    document.querySelector('.date-group-content').style.display = 'block';
  }

  function renderDateSummary(groups) {

    const container = document.getElementById('dateSummaryContent');
    container.innerHTML = '';

    const totals = computeDateTotals(groups);

    Object.keys(totals).forEach(date => {

      const div = document.createElement('div');
      div.className = 'date-summary-item';
      div.setAttribute('data-date-summary', date);

      div.innerHTML = `<strong>${date}</strong>`;

      div.onclick = () => {
        const target = document.querySelector(`[data-date-anchor="${date}"]`);
        if (target) target.scrollIntoView({ behavior: 'smooth' });
      };

      container.appendChild(div);
    });
  }

  function computeDateTotals(groups) {

    const totals = {};

    groups.forEach(g => {

      if (!totals[g.date]) {
        totals[g.date] = {
          gross: 0,
          cash: 0,
          withholding: 0,
          totalPlatformFee: 0
        };
      }

      g.rows.forEach(r => {
        totals[g.date].gross += r.Gross_Sales;
        totals[g.date].cash += r.Cash;
        totals[g.date].withholding += r.Withholding_Tax;
        totals[g.date].totalPlatformFee += r.Total_Platform_Fee;
      });
    });

    return totals;
  }

  function syncSummaryWithScroll() {

    const headers = document.querySelectorAll('[data-date]');
    const summary = document.querySelectorAll('[data-date-summary]');

    let currentDate = null;

    headers.forEach(h => {
      const rect = h.getBoundingClientRect();
      if (rect.top <= 120 && rect.top >= -200) {
        currentDate = h.getAttribute('data-date');
      }
    });

    summary.forEach(s => s.style.background = '');

    if (currentDate) {

      const active = document.querySelector(`[data-date-summary="${currentDate}"]`);

      if (active) {

        active.style.background = '#e9f5ff';

        const panel = document.getElementById('dateSummaryPanel');

        const top = active.offsetTop;
        const bottom = top + active.offsetHeight;

        if (top < panel.scrollTop || bottom > panel.scrollTop + panel.clientHeight) {
          active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }
    }
  }

  function renderFullSheet(rows) {
    rawTableWrapper.innerHTML = JSON.stringify(rows);
  }

  function renderFilteredTable(rows) {
    filteredTableWrapper.innerHTML = JSON.stringify(rows);
  }

  function formatDateTime(v) {
    return new Date(v).toLocaleDateString();
  }

});
