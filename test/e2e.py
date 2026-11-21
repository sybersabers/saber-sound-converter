# ブラウザ（Chrome）で index.html を開き、BoBF.zip を入れて変換 → ダウンロードした ZIP を検証
import sys, os, zipfile, asyncio
from playwright.async_api import async_playwright

HTML, ZIPIN, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(OUT, exist_ok=True)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        pg = await b.new_page(viewport={'width': 1280, 'height': 900}, accept_downloads=True)
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
        await pg.goto('file://' + HTML)
        await pg.evaluate("localStorage.clear()")
        await pg.reload()
        await pg.screenshot(path=f'{OUT}/01_empty.png', full_page=True)
        await pg.set_input_files('#inZip', ZIPIN)
        await pg.wait_for_selector('.font')
        await pg.wait_for_timeout(2500)  # WAV 形式チェック
        print('fonts:', await pg.eval_on_selector_all('.fname', 'e => e.map(x => x.textContent)'))
        print('checked:', await pg.eval_on_selector_all('[data-inc]', 'e => e.map(x => x.checked)'))
        print('sum:', await pg.text_content('#sumBar'))
        await pg.screenshot(path=f'{OUT}/02_loaded_proffie.png', full_page=True)
        for tgt in ['proffie', 'xeno3', 'cfx']:
            await pg.click(f'[data-tgt={tgt}]')
            await pg.wait_for_timeout(300)
            # Xeno3 版（と CFX 版）だけ変換する
            names = await pg.eval_on_selector_all('.fname', 'e => e.map(x => x.textContent)')
            for i, n in enumerate(names):
                want = n in ('Xeno3', 'CFX-GHv3', 'Proffie') and n.lower()[:3] != tgt[:3]
                loc = pg.locator(f'[data-inc="{i}"]')
                if await loc.is_checked() != want: await loc.click(); await pg.wait_for_timeout(150)
            if tgt == 'cfx': await pg.screenshot(path=f'{OUT}/03_preview_cfx.png', full_page=True)
            async with pg.expect_download(timeout=120000) as d:
                await pg.click('#btnConvert')
            dl = await d.value
            path = f'{OUT}/{dl.suggested_filename}'
            await dl.save_as(path)
            await pg.wait_for_timeout(600)
            z = zipfile.ZipFile(path); bad = z.testzip()
            names = z.namelist()
            print(f'{tgt}: {dl.suggested_filename} files={len(names)} testzip={bad}')
            print('   ', [n for n in names if '/' in n][:6], '...')
        await pg.screenshot(path=f'{OUT}/04_done.png', full_page=True)
        await pg.select_option('#langSel', 'en'); await pg.wait_for_timeout(200)
        await pg.set_viewport_size({'width': 1280, 'height': 900})
        await pg.screenshot(path=f'{OUT}/05_en.png')
        print('errors:', errs)
        await b.close()
asyncio.run(main())
