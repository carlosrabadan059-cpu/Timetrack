import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const outDir = path.join(process.cwd(), 'screenshots');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir);
}

const employeeData = {
    id: 'user-1',
    email: 'empleado@timetrack.com',
    profile: {
        id: 'user-1',
        name: 'Josema',
        role: 'employee',
        is_active: true,
        created_at: '2026-01-01T00:00:00Z'
    }
};

const adminData = {
    id: 'user-2',
    email: 'admin@timetrack.com',
    profile: {
        id: 'user-2',
        name: 'Carlos Admin',
        role: 'admin',
        is_active: true,
        created_at: '2026-01-01T00:00:00Z'
    }
};

const BASE_URL = 'http://localhost:5173';

const employeeRoutes = [
  { path: '/dashboard', name: 'employee_01_dashboard.png' },
  { path: '/historial', name: 'employee_02_historial.png' },
  { path: '/correcciones', name: 'employee_03_correcciones.png' },
  { path: '/reportes', name: 'employee_04_reportes.png' },
  { path: '/perfil', name: 'employee_05_perfil.png' }
];

const adminRoutes = [
  { path: '/admin', name: 'admin_01_dashboard.png' },
  { path: '/admin/correcciones', name: 'admin_02_correcciones.png' },
  { path: '/admin/empleados', name: 'admin_03_empleados.png' },
  { path: '/admin/fichajes', name: 'admin_04_fichajes.png' },
  { path: '/admin/informes', name: 'admin_05_informes.png' },
  { path: '/admin/configuracion', name: 'admin_06_configuracion.png' }
];

async function takeScreenshot(page, routePath, fileName, userData) {
  console.log(`Taking screenshot for ${routePath}...`);
  // Navigate to login to ensure domain is correct
  await page.goto(`${BASE_URL}/login`);
  await page.evaluate((data) => {
    localStorage.setItem('timetrack_user', JSON.stringify(data));
  }, userData);
  
  // Now navigate to the desired route
  await page.goto(`${BASE_URL}${routePath}`, { waitUntil: 'networkidle0' });
  await page.screenshot({ path: path.join(outDir, fileName), fullPage: true });
}

async function run() {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  console.log('Capturing Login Page...');
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.clear());
  // reload just in case
  await page.reload({ waitUntil: 'networkidle0' });
  await page.screenshot({ path: path.join(outDir, '00_login.png'), fullPage: true });

  console.log('Capturing Employee screens...');
  for (const route of employeeRoutes) {
    await takeScreenshot(page, route.path, route.name, employeeData);
  }

  console.log('Capturing Admin screens...');
  for (const route of adminRoutes) {
    await takeScreenshot(page, route.path, route.name, adminData);
  }

  await browser.close();
  console.log('Done!');
}

run().catch(console.error);
