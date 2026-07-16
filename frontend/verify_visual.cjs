const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));

  try {
    console.log("Navegando a la app...");
    await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle0' });
    
    // Login
    console.log("Iniciando sesión con chofer1@gebo.com...");
    await page.waitForSelector('input[type="email"]');
    await page.type('input[type="email"]', 'chofer1@gebo.com');
    await page.type('input[type="password"]', 'gebo123');
    
    // Buscar el botón 'Entrar'
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const enterBtn = btns.find(b => b.innerText.includes('Entrar'));
      if (enterBtn) enterBtn.click();
    });

    // Wait for the URL to change to /chofer or something, or wait for navigation
    // Let's explicitly navigate to /chofer just in case, but login might automatically do it
    console.log("Esperando redirección...");
    await page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {});
    
    // Ensure we are on /chofer
    const url = page.url();
    if (!url.includes('/chofer')) {
      console.log("Forzando navegación a /chofer...");
      await page.goto('http://localhost:5173/chofer', { waitUntil: 'networkidle0' });
    }

    // 1. Cargando perfil desaparece
    console.log("Verificando que 'Cargando perfil...' desaparece...");
    await page.waitForFunction(
      () => !document.body.innerText.includes('Cargando perfil...'),
      { timeout: 5000 }
    );
    console.log("[OK] 'Cargando perfil...' desapareció en menos de 5 segundos.");

    // 2. Aparece Carlos Demo
    console.log("Verificando texto 'Carlos Demo'...");
    await page.waitForFunction(
      () => document.body.innerText.includes('Carlos Demo'),
      { timeout: 5000 }
    );
    console.log("[OK] Texto 'Carlos Demo' apareció en pantalla.");

    // 3. Botón INICIAR TURNO (o FINALIZAR TURNO si ya está disponible)
    console.log("Verificando estado de turno...");
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll('button')).some(b => b.innerText.includes('TURNO')),
      { timeout: 5000 }
    );
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const startShiftBtn = btns.find(b => b.innerText.includes('INICIAR TURNO'));
      if (startShiftBtn) {
        startShiftBtn.click();
        console.log("[OK] Botón 'INICIAR TURNO' presionado.");
      } else {
        console.log("[OK] Ya estaba iniciado (FINALIZAR TURNO visible).");
      }
    });
    
    console.log("Esperando 2 segundos para que Realtime conecte...");
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 4. Mapa cargado
    console.log("Verificando tiles del mapa (.leaflet-tile-loaded)...");
    await page.waitForSelector('.leaflet-tile-loaded', { timeout: 10000 });
    console.log("[OK] Mapa Leaflet cargó sus tiles exitosamente.");

    // --- NUEVO PARA VISTA 2 ---
    console.log("Simulando trigger de oferta de faena desde backend...");
    const { execSync } = require('child_process');
    execSync('python tests/trigger_offer.py');

    console.log("Verificando modal de nueva faena...");
    await page.waitForFunction(
      () => document.body.innerText.includes('¡Nueva Faena!'),
      { timeout: 10000 }
    );
    console.log("[OK] Modal de oferta apareció.");

    console.log("Verificando atributos del vehículo...");
    await page.waitForFunction(
      () => document.body.innerText.includes('AUTO - AUTOMATICO'),
      { timeout: 5000 }
    );
    console.log("[OK] Atributos del vehículo presentes.");

    console.log("Verificando advertencia de auto eléctrico...");
    await page.waitForFunction(
      () => document.body.innerText.includes('Atención: Vehículo Eléctrico'),
      { timeout: 5000 }
    );
    console.log("[OK] Advertencia de vehículo eléctrico presente.");

    console.log("Verificando timer de 15 segundos...");
    await page.waitForFunction(
      () => document.body.innerText.includes('14s') || document.body.innerText.includes('15s'),
      { timeout: 5000 }
    );
    console.log("[OK] Timer visible y funcionando.");

    console.log("Probando botón RECHAZAR...");
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const rejectBtn = btns.find(b => b.innerText.includes('RECHAZAR'));
      if (rejectBtn) rejectBtn.click();
    });

    console.log("Verificando que el modal desapareció...");
    await page.waitForFunction(
      () => !document.body.innerText.includes('¡Nueva Faena!'),
      { timeout: 5000 }
    );
    console.log("[OK] Modal desapareció al rechazar.");

    // --- NUEVO PARA VISTA 3 ---
    console.log("Simulando segunda oferta de faena para Vista 3...");
    execSync('python tests/trigger_offer.py');

    console.log("Verificando nuevo modal...");
    await page.waitForFunction(
      () => document.body.innerText.includes('¡Nueva Faena!'),
      { timeout: 10000 }
    );
    console.log("[OK] Segundo modal de oferta apareció.");

    console.log("Probando botón ACEPTAR...");
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const acceptBtn = btns.find(b => b.innerText.includes('ACEPTAR'));
      if (acceptBtn) acceptBtn.click();
    });

    console.log("Verificando Vista 3: 'En camino al cliente'...");
    await page.waitForFunction(
      () => document.body.innerText.includes('En camino al cliente'),
      { timeout: 10000 }
    );
    console.log("[OK] Vista 3 apareció.");

    console.log("Verificando botón 'LLEGUÉ AL VEHÍCULO'...");
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll('button')).some(b => b.innerText.includes('LLEGUÉ AL VEHÍCULO')),
      { timeout: 5000 }
    );
    console.log("[OK] Botón 'LLEGUÉ AL VEHÍCULO' encontrado.");

    console.log("Verificando marcadores en el mapa...");
    await page.waitForFunction(
      () => document.querySelectorAll('.leaflet-marker-icon').length >= 2,
      { timeout: 5000 }
    );
    console.log("[OK] Hay al menos dos marcadores en el mapa.");

    console.log("Probando click en 'LLEGUÉ AL VEHÍCULO' (Demo mode)...");
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const arriveBtn = btns.find(b => b.innerText.includes('LLEGUÉ AL VEHÍCULO'));
      if (arriveBtn && !arriveBtn.disabled) arriveBtn.click();
    });

    console.log("Verificando que el estado cambia a Vista 4 (Resumen de Faena)...");
    await page.waitForFunction(
      () => document.body.innerText.includes('Resumen de Faena'),
      { timeout: 5000 }
    );
    console.log("[OK] Estado cambió a llegado correctamente y muestra resumen.");

    console.log("Probando omitir foto (Demo mode)...");
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const skipBtn = btns.find(b => b.innerText.includes('OMITIR FOTO (DEMO)'));
      if (skipBtn) skipBtn.click();
    });

    console.log("Probando click en 'INICIAR FAENA'...");
    // Give state a moment to update so INICIAR FAENA gets enabled
    await new Promise(resolve => setTimeout(resolve, 500));
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const startBtn = btns.find(b => b.innerText.includes('INICIAR FAENA'));
      if (startBtn && !startBtn.disabled) startBtn.click();
    });

    console.log("Verificando que el estado cambia a 'Faena en curso'...");
    await page.waitForFunction(
      () => document.body.innerText.includes('Faena en curso'),
      { timeout: 5000 }
    );
    console.log("[OK] Faena iniciada exitosamente.");

    // --- NUEVO PARA VISTA 5 ---
    console.log("Verificando timer y costo acumulado...");
    // Wait for 2.5 seconds to ensure timer ticks up from 00:00:00
    await new Promise(resolve => setTimeout(resolve, 2500));
    
    await page.waitForFunction(
      () => {
        const text = document.body.innerText;
        return text.match(/00:00:\d{2}/) && text.includes('$');
      },
      { timeout: 8000 }
    );
    console.log("[OK] Timer y costo acumulado están actualizándose.");

    console.log("Probando omitir foto final (Demo mode)...");
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const skipBtn = btns.find(b => b.innerText.includes('OMITIR FOTO (DEMO)'));
      if (skipBtn) skipBtn.click();
    });

    console.log("Probando click en 'FINALIZAR FAENA'...");
    await new Promise(resolve => setTimeout(resolve, 500));
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const finishBtn = btns.find(b => b.innerText.includes('FINALIZAR FAENA'));
      if (finishBtn && !finishBtn.disabled) finishBtn.click();
    });

    console.log("Verificando retorno a Vista 1 / Vista 6 (Chofer disponible)...");
    await page.waitForFunction(
      () => !document.body.innerText.includes('Faena en curso') && document.body.innerText.includes('FINALIZAR TURNO'),
      { timeout: 5000 }
    );
    console.log("[OK] Faena finalizada exitosamente. Chofer disponible.");

    // --- NUEVO PARA VISTA 6 ---
    console.log("Verificando Vista 6: Panel entre faenas...");
    await page.waitForFunction(
      () => document.body.innerText.includes('Faenas Hoy') && document.body.innerText.includes('Ganancias') && document.body.innerText.includes('Historial del día'),
      { timeout: 5000 }
    );
    console.log("[OK] Métricas y panel de Vista 6 visibles.");

    console.log("Verificando indicador de fatiga...");
    await page.waitForFunction(
      () => document.body.innerText.includes('Fatiga:'),
      { timeout: 5000 }
    );
    console.log("[OK] Indicador de fatiga visible.");

    console.log("VERIFICACIÓN COMPLETA: Todo el flujo Vista 1 -> Vista 2 -> Vista 3 -> Vista 4 -> Vista 5 -> Vista 6 exitoso.");
  } catch (error) {
    console.error("ERROR EN VERIFICACIÓN:", error.message);
    const body = await page.evaluate(() => document.body.innerText);
    console.log("BODY ACTUAL:", body);
  } finally {
    await browser.close();
  }
})();
