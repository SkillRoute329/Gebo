const puppeteer = require('puppeteer');
const { execSync } = require('child_process');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  // Set console listener
  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  page.on('dialog', async dialog => {
      console.log('BROWSER DIALOG:', dialog.message());
      await dialog.dismiss();
  });

  const EMAIL = 'cliente1@gebo.com';

  try {
    console.log("Navegando a la app...");
    await page.goto('http://localhost:5174/login');
    await page.waitForSelector('input[type="email"]');
    
    console.log(`Iniciando sesión con ${EMAIL}...`);
    await page.type('input[type="email"]', EMAIL, { delay: 50 });
    await page.type('input[type="password"]', 'gebo123', { delay: 50 });
    
    await new Promise(r => setTimeout(r, 500));
    
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Entrar'));
      if (btn) btn.click();
    });

    // Esperar a navegar a /cliente
    await page.waitForFunction(() => window.location.pathname.includes('/cliente'), { timeout: 10000 });

    // Esperar a que renderice algo (un h2 o un botón que no sea de login)
    await page.waitForFunction(() => {
      const h2 = document.querySelector('h2');
      const btns = Array.from(document.querySelectorAll('button'));
      return h2 !== null || btns.some(b => b.innerText.includes('Cancelar'));
    }, { timeout: 10000 });

    const hasCancel = await page.evaluate(() => {
       const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Cancelar');
       if (btn) { btn.click(); return true; }
       return false;
    });

    if (hasCancel) {
      console.log('Limpiando faena activa previa de seed...');
      await new Promise(r => setTimeout(r, 1000)); // wait for modal animation
      await page.evaluate(() => {
         const btns = Array.from(document.querySelectorAll('button'));
         const confirmBtn = btns.find(b => b.innerText.includes('Sí, cancelar'));
         if (confirmBtn) confirmBtn.click();
      });
      await new Promise(r => setTimeout(r, 2000));
      // Esperar a que vuelva a cargar Mis Vehículos u Onboarding
      await page.waitForSelector('h2', { timeout: 10000 });
    }
    
    // Ahora leemos el h2
    const h2Text = await page.$eval('h2', el => el.innerText);
    
    // Check if we need to onboard or if we already see "Mis Vehículos"
    if (h2Text === 'Registra tu Vehículo') {
      console.log("Vista 1: Registrando vehículo (Onboarding)...");
      await page.type('input[name="marca"]', 'Toyota');
      await page.type('input[name="modelo"]', 'Corolla');
      await page.type('input[name="año"]', '2023');
      await page.type('input[name="patente"]', `SBA${Math.floor(Math.random()*10000)}`);
      await page.click('button[type="submit"]');
    }

    console.log("Vista 1: Esperando 'Mis Vehículos'...");
    await page.waitForFunction(() => document.body.innerText.includes('Mis Vehículos'), { timeout: 10000 });
    console.log("[OK] Vista 1 completada.");

    // Select the first vehicle
    console.log("Vista 2: Seleccionando vehículo y solicitando faena...");
    await page.click('div > p[style*="font-weight: bold"]'); // Click on vehicle card
    
    await page.waitForSelector('input[placeholder="¿Dónde está tu vehículo?"]', { timeout: 10000 });
    await page.type('input[placeholder="¿Dónde está tu vehículo?"]', '18 de julio montevideo');
    await page.waitForFunction(() => document.body.innerText.includes('18 de Julio'), { timeout: 10000 });
    await page.evaluate(() => {
        const pTags = Array.from(document.querySelectorAll('p'));
        const targetP = pTags.find(p => p.innerText.includes('18 de Julio'));
        if (targetP) {
            targetP.closest('div[style*="cursor: pointer"]').click();
        } else {
            console.log('No se encontro target para 18 de Julio');
        }
    });

    // Type in dest and select from dropdown
    await page.type('input[placeholder="¿A dónde vas?"]', 'bulevar artigas montevideo');
    await page.waitForFunction(() => document.body.innerText.includes('Bulevar General Artigas'), { timeout: 10000 });
    await page.evaluate(() => {
        const pTags = Array.from(document.querySelectorAll('p'));
        const targetP = pTags.find(p => p.innerText.includes('Bulevar General Artigas'));
        if (targetP) {
            targetP.closest('div[style*="cursor: pointer"]').click();
        } else {
            console.log('No se encontro target para Bulevar');
        }
    });

    // Request Chofer
    console.log("Esperando cálculo de tarifa...");
    await page.waitForFunction(() => document.body.innerText.includes('Tarifa Estimada'), { timeout: 10000 });
    
    await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const btn = btns.find(b => b.innerText.includes('SOLICITAR CHOFER'));
        if (btn) btn.click();
    });

    console.log("Vista 3: Esperando pantalla 'Buscando'...");
    await page.waitForFunction(() => document.body.innerText.includes('Buscando al mejor chofer'));
    console.log("[OK] Vista 3 (Buscando) confirmada.");
    
    console.log("Verificando si hay popup de notificaciones...");
    try {
        await page.waitForFunction(() => document.body.innerText.includes('Mantente informado'), { timeout: 3000 });
        console.log("Popup detectado. Rechazando...");
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const btn = btns.find(b => b.innerText.includes('Ahora no'));
            if (btn) btn.click();
        });
    } catch (e) {
        console.log("No hubo popup de notificaciones.");
    }
    
    // Wait for React to fetch and subscribe to realtime
    await new Promise(r => setTimeout(r, 2000));
    
    console.log("Simulando que el chofer acepta la faena...");
    execSync(`python tests/simulate_chofer_response.py assign ${EMAIL}`);
    
    console.log("Vista 4: Esperando pantalla 'Chofer Asignado'...");
    await page.waitForFunction(() => document.body.innerText.includes('SOS Emergencia'), { timeout: 15000 });
    console.log("[OK] Vista 4 confirmada. El chofer está en camino.");

    console.log("Simulando que el chofer llegó al vehículo...");
    execSync(`python tests/simulate_chofer_response.py arrive ${EMAIL}`);
    await page.waitForFunction(() => document.body.innerText.includes('llegó al vehículo'), { timeout: 15000 });
    console.log("[OK] Alerta de llegada recibida.");

    console.log("Simulando que el chofer inicia la faena...");
    execSync(`python tests/simulate_chofer_response.py start ${EMAIL}`);
    await page.waitForFunction(() => document.body.innerText.includes('Tiempo Transcurrido'), { timeout: 15000 });
    console.log("Vista 5: [OK] Faena en curso detectada.");

    console.log("Simulando que el chofer finaliza la faena...");
    execSync(`python tests/simulate_chofer_response.py finish ${EMAIL}`);
    await page.waitForFunction(() => document.body.innerText.includes('¡Faena Completada!'), { timeout: 15000 });
    console.log("Vista 6: [OK] Resumen de faena detectado.");
    
    const costoText = await page.evaluate(() => {
        const el = document.querySelector('p[style*="font-size: 2.5rem"]');
        return el ? el.innerText : null;
    });
    console.log(`Costo reportado en frontend: ${costoText}`);
    
    console.log("VERIFICACIÓN COMPLETA: Flujo Cliente Vista 1 -> 6 exitoso.");

  } catch (error) {
    console.error("Test Falló:", error);
    await page.screenshot({ path: 'frontend/error_cliente.png' });
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
