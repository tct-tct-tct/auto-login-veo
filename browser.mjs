import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteer.use(StealthPlugin());

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const randomDelay = (min, max) =>
  delay(Math.floor(Math.random() * (max - min) + min));

async function humanType(page, selector, text) {
  await page.click(selector);
  for (const char of text) {
    await page.type(selector, char, {
      delay: Math.floor(Math.random() * 100 + 40),
    });
  }
}

async function getAccountInfo(page, log) {
  let isUltra = false;
  let credits = null;

  try {
    log("8️⃣ Kiểm tra thông tin tài khoản...");
    await delay(2000);

    // Kiểm tra badge ULTRA trên header
    isUltra = await page.evaluate(() => {
      const els = document.querySelectorAll('*');
      for (const el of els) {
        const text = el.textContent.trim();
        if (text === 'ULTRA' && el.children.length === 0 && el.offsetParent !== null) {
          return true;
        }
      }
      return false;
    });
    log(`   Ultra: ${isUltra ? '✅ Có' : '❌ Không'}`);

    // Click avatar (phần tử cuối cùng ở góc trên bên phải, thường là img hoặc button có hình tròn)
    log("   Click avatar để mở dropdown...");
    let avatarClicked = await page.evaluate(() => {
      // Ưu tiên 1: Tìm img avatar bằng alt text (ổn định nhất)
      const avatarImg = document.querySelector('img[alt*="hồ sơ"], img[alt*="profile picture"], img[alt*="Profile"]');
      if (avatarImg) {
        // Click vào button cha chứa avatar
        const parentBtn = avatarImg.closest('button') || avatarImg.parentElement?.closest('button') || avatarImg;
        parentBtn.click();
        return 'avatar-img-alt';
      }

      // Ưu tiên 2: Tìm bằng aria-label
      const selectors = [
        'button[aria-label*="Account"]',
        'button[aria-label*="Tài khoản"]',
        '[aria-label*="profile"]',
        '[aria-label*="Profile"]',
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) {
          el.click();
          return 'selector: ' + sel;
        }
      }

      // Fallback: Tìm phần tử hình tròn ở góc trên phải
      const allEls = document.querySelectorAll('button, [role="button"], a, div, img');
      for (const el of allEls) {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        const isCircle = style.borderRadius === '50%' || parseInt(style.borderRadius) >= 20;
        if (rect.right > window.innerWidth - 80 && rect.top < 80 && rect.width >= 24 && rect.width <= 60 && isCircle) {
          el.click();
          return 'fallback-circle';
        }
      }
      return false;
    });

    // Fallback cuối: click theo tọa độ góc trên bên phải (avatar luôn ở vị trí cố định)
    if (!avatarClicked) {
      log("   Thử click theo tọa độ...");
      await page.mouse.click(1340, 42);
      avatarClicked = 'coordinate-click';
    }

    log(`   Avatar click: ${avatarClicked}`);

    if (avatarClicked) {
      await delay(2000);

      // Đọc credit từ dropdown
      credits = await page.evaluate(() => {
        const allElements = document.querySelectorAll('*');
        let maxCredits = null;
        
        for (const el of allElements) {
          const text = el.textContent.trim();
          // Bắt các pattern chuẩn như "25000 Tín dụng AI" hoặc "25,000 AI Credit"
          const match = text.match(/(?:^|\s)(\d{1,3}(?:[.,]\d{3})*|\d+)\s*(?:Tín dụng AI|AI Credit|Tín dụng)/i);
          
          // Thêm điều kiện: element không được chứa quá nhiều chữ khác (để tránh lấy nhầm text rác/ẩn)
          // Và tránh thẻ có quá nhiều child
          if (match && el.children.length <= 3 && text.length < 50) {
            const num = parseInt(match[1].replace(/[,\.\s]/g, ''), 10);
            if (maxCredits === null || num > maxCredits) {
              maxCredits = num;
            }
          }
        }
        return maxCredits;
      });

      log(`   Credits: ${credits !== null ? `✅ ${credits}` : '⚠ Không đọc được'}`);

      // Đóng dropdown (click ra ngoài)
      await page.evaluate(() => {
        const closeBtn = document.querySelector('[aria-label="Close"], [aria-label="Đóng"]');
        if (closeBtn) closeBtn.click();
        else document.body.click();
      });
      await delay(500);
    }
  } catch (err) {
    log(`   ⚠ Lỗi khi lấy thông tin tài khoản: ${err.message}`);
  }

  return { isUltra, credits };
}

export async function getCookie({ email, password, proxy }) {
  let browser;
  const startTime = Date.now();
  const log = (msg) => console.log(`[${new Date().toISOString()}] [${email}] ${msg} (+${Date.now() - startTime}ms)`);

  const execPath = process.env.PUPPETEER_EXECUTABLE_PATH || null;
  log(`▶ Bắt đầu | mode: ${execPath ? "VPS Docker" : "Heroku"} | proxy: ${proxy || "none"}`);

  const baseArgs = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-blink-features=AutomationControlled",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-infobars",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--lang=en-US,en",
    "--window-size=1366,768",
  ];

  if (proxy) {
    baseArgs.push(`--proxy-server=${proxy}`);
  }

  try {
    log("1️⃣ Khởi động browser...");
    if (execPath) {
      browser = await puppeteer.launch({
        args: baseArgs,
        defaultViewport: { width: 1366, height: 768 },
        executablePath: execPath,
        headless: "new",
        ignoreDefaultArgs: ["--enable-automation"],
      });
    } else {
      const chromium = await import("@sparticuz/chromium").then((m) => m.default);
      browser = await puppeteer.launch({
        args: [...chromium.args, ...baseArgs],
        defaultViewport: { width: 1366, height: 768 },
        executablePath: await chromium.executablePath(),
        headless: chromium.headless,
        ignoreDefaultArgs: ["--enable-automation"],
      });
    }
    log("✅ Browser đã khởi động");

    const page = (await browser.pages())[0];

    // Anti-detection
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
      Object.defineProperty(navigator, "plugins", {
        get: () => [1, 2, 3, 4, 5],
      });
      Object.defineProperty(navigator, "languages", {
        get: () => ["en-US", "en"],
      });
      window.chrome = { runtime: {} };
    });

    await page.setUserAgent(
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    );

    // BƯỚC 1: Vào labs.google
    log("2️⃣ Truy cập https://labs.google/fx/tools/flow ...");
    await page.goto("https://labs.google/fx/tools/flow", {
      waitUntil: "networkidle2",
      timeout: 60000,
    });
    log(`✅ Đã load trang | URL: ${page.url()}`);
    await randomDelay(2000, 3000);

    // BƯỚC 2: Click "Create with Flow"
    log('3️⃣ Tìm nút "Create with Flow"...');
    let clicked = await page.evaluate(() => {
      const els = [
        ...document.querySelectorAll("a, button, span, div[role='button']"),
      ];
      for (const el of els) {
        if (el.textContent.trim().toLowerCase().includes("create with flow")) {
          el.click();
          return true;
        }
      }
      return false;
    });

    if (!clicked) {
      for (const sel of ['a[href*="flow"]', 'button[class*="cta"]']) {
        try {
          const el = await page.$(sel);
          if (el) {
            await el.click();
            clicked = true;
            break;
          }
        } catch (e) {}
      }
    }

    log(`   Click result: ${clicked ? "✅ Đã click" : "⚠ Không tìm thấy nút"}`);
    try {
      await page.waitForNavigation({
        waitUntil: "networkidle2",
        timeout: 30000,
      });
    } catch (e) {
      log("   ⚠ Navigation timeout sau click");
    }
    await randomDelay(2000, 3000);

    // BƯỚC 3: Login Google
    let url = page.url();
    log(`4️⃣ URL sau click: ${url}`);

    if (url.includes("accounts.google.com")) {
      log("5️⃣ Đang ở trang Google Login");
      // Nhập email
      log("   Đợi ô email...");
      await page.waitForSelector('input[type="email"]', { timeout: 20000 });
      await randomDelay(500, 1000);
      log(`   Nhập email: ${email}`);
      await humanType(page, 'input[type="email"]', email);
      await randomDelay(300, 600);
      await page.keyboard.press("Enter");
      log("   ✅ Đã nhập email, đợi ô password...");
      await randomDelay(3000, 5000);

      // Nhập password
      await page.waitForSelector('input[type="password"]', {
        visible: true,
        timeout: 20000,
      });
      await randomDelay(500, 1000);
      log("   Nhập password...");
      await humanType(page, 'input[type="password"]', password);
      await randomDelay(300, 600);
      await page.keyboard.press("Enter");
      log("   ✅ Đã nhập password, đợi redirect...");

      try {
        await page.waitForNavigation({
          waitUntil: "networkidle2",
          timeout: 15000,
        });
      } catch (e) {
        log("   ⚠ Navigation timeout sau login");
      }

      // Check lỗi login
      const loginUrl = page.url();
      log(`   URL sau login: ${loginUrl}`);

      // Sai password
      if (loginUrl.includes("challenge/pwd") || loginUrl.includes("signin/identifier")) {
        const errorText = await page.evaluate(() => {
          const errEl = document.querySelector('[class*="error"], [aria-live="assertive"], .o6cuMc, .dEOOab, .GQ8Pzc');
          return errEl ? errEl.textContent.trim() : null;
        });
        log(`   ❌ Login thất bại: ${errorText || "Sai email hoặc password"}`);
        await browser.close();
        browser = null;
        return {
          success: false,
          email,
          error: errorText || "Sai email hoặc password",
          url: loginUrl,
          cookieString: "",
        };
      }

      // Bị chặn / cần xác minh
      if (loginUrl.includes("challenge") || loginUrl.includes("rejected") || loginUrl.includes("deniedsigninrejected")) {
        const challengeType = loginUrl.includes("recaptcha") ? "CAPTCHA" : "Xác minh bổ sung";
        log(`   ❌ Google yêu cầu: ${challengeType}`);
        await browser.close();
        browser = null;
        return {
          success: false,
          email,
          error: `Google yêu cầu ${challengeType}. Thử dùng residential proxy.`,
          url: loginUrl,
          cookieString: "",
        };
      }
    } else {
      log(`⚠ Không redirect sang Google Login. URL: ${url}`);
    }

    // BƯỚC 4: Đợi cookie session
    log("6️⃣ Đợi cookie session xuất hiện...");
    await randomDelay(5000, 8000);

    const targetCookies = [
      "__Secure-next-auth.session-token",
      "__Host-next-auth.csrf-token",
    ];

    let allCookies = [];
    let found = false;

    for (let i = 0; i < 15 && !found; i++) {
      await delay(2000);
      const client = await page.createCDPSession();
      const { cookies } = await client.send("Network.getAllCookies");
      allCookies = cookies;
      await client.detach();
      found = targetCookies.every((t) => cookies.some((c) => c.name === t));
      if (!found) {
        const labsCount = cookies.filter((c) => c.domain.includes("labs.google")).length;
        log(`   Polling ${i + 1}/15... (${labsCount} labs cookies, URL: ${page.url()})`);
      }
    }

    // BƯỚC 5: Xuất cookies
    log(`7️⃣ Kết quả polling: ${found ? "✅ Tìm thấy session cookie" : "❌ Không tìm thấy session cookie"}`);
    const labsCookies = allCookies.filter((c) =>
      c.domain.includes("labs.google")
    );
    const cookieString = labsCookies
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");

    // BƯỚC 6: Lấy thông tin tài khoản (Ultra + Credits)
    let accountInfo = { isUltra: false, credits: null };
    if (found && cookieString.length > 0) {
      accountInfo = await getAccountInfo(page, log);
    }

    await browser.close();
    browser = null;
    log(`✅ Browser đã đóng | Tổng: ${Date.now() - startTime}ms`);

    if (found && cookieString.length > 0) {
      log(`🎉 THÀNH CÔNG | ${labsCookies.length} cookies | Ultra: ${accountInfo.isUltra} | Credits: ${accountInfo.credits}`);
      return {
        success: true,
        email,
        cookieString,
        cookies: labsCookies,
        isUltra: accountInfo.isUltra,
        credits: accountInfo.credits,
      };
    } else {
      log(`❌ THẤT BẠI | URL cuối: ${url}`);
      return {
        success: false,
        email,
        error:
          "Không lấy được session cookie. Google có thể đã chặn hoặc yêu cầu xác minh.",
        url,
        cookieString,
      };
    }
  } catch (err) {
    log(`💥 LỖI: ${err.message}`);
    if (browser) await browser.close();
    throw err;
  }
}
