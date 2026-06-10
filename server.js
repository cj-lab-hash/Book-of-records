// server.js
const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const upload = multer({ dest: 'uploads/' });

app.use(express.static(path.join(__dirname, 'public')));

app.post('/upload-excel', upload.single('excelFile'), (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  
      const workbook = xlsx.readFile(req.file.path, { cellDates: true, cellNF: false, cellText: false });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
  
      // --- Force reading all rows, ignoring filters and table limits ---
      // Use the lower-level cell map instead of !ref
      const cellAddresses = Object.keys(worksheet).filter(k => !k.startsWith('!'));
      const coords = cellAddresses.map(k => xlsx.utils.decode_cell(k));
  
      // Determine actual min/max row and column from all cells
      const minRow = Math.min(...coords.map(c => c.r));
      const maxRow = Math.max(...coords.map(c => c.r));
      const minCol = Math.min(...coords.map(c => c.c));
      const maxCol = Math.max(...coords.map(c => c.c));
  
      // Build rawArrays manually
      const rawArrays = [];
      for (let R = minRow; R <= maxRow; R++) {
        const row = [];
        for (let C = minCol; C <= maxCol; C++) {
          const cellAddress = xlsx.utils.encode_cell({ r: R, c: C });
          const cell = worksheet[cellAddress];
          row.push(cell ? cell.v : '');
        }
        rawArrays.push(row);
      }
  
      fs.unlinkSync(req.file.path);
  
      res.json({
        sheetName: firstSheetName,
        rowCount: rawArrays.length,
        rawArrays
      });
    } catch (error) {
      console.error('Error reading Excel:', error);
      res.status(500).json({ error: 'Failed to process Excel file.' });
    }
  });
  
  

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
