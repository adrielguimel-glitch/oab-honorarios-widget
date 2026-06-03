/**
 * Google Apps Script — Recebe leads do widget OAB e salva na planilha
 *
 * Como configurar:
 * 1. Abra o Google Sheets onde quer salvar os leads
 * 2. Extensions → Apps Script
 * 3. Cole este código e salve
 * 4. Deploy → New deployment → Web App
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Copie a URL gerada e use como data-leads-url no widget
 */

function doPost(e) {
  try {
    const data  = JSON.parse(e.postData.contents);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

    // Cria cabeçalho se a planilha estiver vazia
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['Data', 'Nome', 'E-mail', 'Telefone', 'Site', 'Primeira Pergunta']);
    }

    sheet.appendRow([
      new Date(),
      data.nome       || '',
      data.email      || '',
      data.telefone   || '',
      data.site       || '',
      data.pergunta   || '',
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Health check
function doGet() {
  return ContentService.createTextOutput('OAB Widget Leads — OK');
}
