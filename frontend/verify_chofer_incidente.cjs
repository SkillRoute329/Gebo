const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('response', response => {
    if (!response.ok()) {
      console.log('FAILED RESPONSE:', response.url(), response.status());
    }
  });
  
  try {
    console.log("Navegando a la vista del Chofer...");
    await page.goto('http://localhost:5173/chofer', { waitUntil: 'networkidle2' });
    
    // Screenshot to see what's going on
    await page.screenshot({ path: 'chofer_test_screenshot.png' });
    console.log("Screenshot saved as chofer_test_screenshot.png");
    
    // Login
    console.log("Iniciando sesión...");
    await page.waitForSelector('input[type="email"]', { timeout: 5000 });
    await page.type('input[type="email"]', 'chofer1@gebo.com', { delay: 50 });
    await page.type('input[type="password"]', 'gebo123', { delay: 50 });
    
    await page.click('button');
    await new Promise(r => setTimeout(r, 5000));
    
    console.log("Recargando para evadir clock drift...");
    await page.reload({ waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 5000));
    
    // Debería estar en Vista 5 (en_curso) debido al seed
    console.log("Verificando panel en_curso...");
    await page.waitForSelector('button', { timeout: 5000 });
    
    const pageText = await page.evaluate(() => document.body.innerText);
    if (!pageText.includes("Costo") && !pageText.includes("FINALIZAR FAENA")) {
      throw new Error("No se detectó la vista en curso (Vista 5).");
    }

    console.log("Verificando existencia de botón Chat...");
    const buttons = await page.$$('button');
    let hasChat = false;
    let hasIncidente = false;
    for (let btn of buttons) {
        const text = await page.evaluate(el => el.textContent, btn);
        if (text.includes("Chat")) hasChat = true;
        if (text.includes("Incidente")) hasIncidente = true;
    }

    if (!hasChat) throw new Error("Botón 'Chat' no encontrado.");
    if (!hasIncidente) throw new Error("Botón 'Incidente' no encontrado.");
    console.log("Botones encontrados correctamente.");

    console.log("Abriendo Chat...");
    const chatBtn = await page.evaluateHandle(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        return btns.find(b => b.textContent.includes('Chat'));
    });
    await page.evaluate(b => b.click(), chatBtn);
    await new Promise(r => setTimeout(r, 1000));

    console.log("Verificando panel Chat...");
    const chatText = await page.evaluate(() => document.body.innerText);
    if (!chatText.includes("Chat con el")) {
        throw new Error("Modal de chat no se abrió correctamente.");
    }
    
    // Cierra Chat
    const closeBtns = await page.$$('button');
    for (let b of closeBtns) {
        try {
            const c = await page.evaluate(el => el.innerHTML, b);
            if (c.includes("lucide-x") || c.includes("line")) { // Some SVG icons might not have lucide-x class
                await page.evaluate(el => el.click(), b);
                break;
            }
        } catch (e) {}
    }
    await new Promise(r => setTimeout(r, 1000));

    console.log("Abriendo Incidente...");
    const incBtn = await page.evaluateHandle(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        return btns.find(b => b.textContent.includes('Incidente'));
    });
    await page.evaluate(b => b.click(), incBtn);
    await new Promise(r => setTimeout(r, 1000));
    
    const incText = await page.evaluate(() => document.body.innerText);
    if (!incText.includes("Reportar Incidente")) {
        throw new Error("Modal de incidente no se abrió correctamente.");
    }

    console.log("Escribiendo y reportando incidente...");
    await page.type('textarea', 'Problema con una rueda', { delay: 50 });
    const repBtn = await page.evaluateHandle(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        return btns.find(b => b.textContent.includes('Reportar'));
    });
    await page.evaluate(b => b.click(), repBtn);
    await new Promise(r => setTimeout(r, 4000));

    const finalText = await page.evaluate(() => document.body.innerText);
    if (!finalText.includes("Timer pausado")) {
        throw new Error("No apareció el banner de INCIDENTE EN REVISIÓN tras reportar.");
    }

    console.log("✅ verify_chofer_incidente: Todo en verde.");
  } catch (error) {
    await page.screenshot({ path: 'chofer_test_fail.png' });
    console.error("❌ Error en verificación visual:", error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
