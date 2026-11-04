/* Service Worker – Enyaq Ladekosten
 * - App-Shell (index.html) und die CDN-Skripte werden gecacht, die App startet dadurch auch offline.
 * - HTML: "Network first" (du bekommst nach einem Deploy sofort die neue Version, offline den Cache).
 * - Skripte/Schriften/sonstige Dateien: "Stale while revalidate" (schnell aus dem Cache, im Hintergrund aktualisiert).
 * - Die KI-Abfrage (/api/…) wird NIE gecacht und läuft immer übers Netz.
 * Bei größeren Änderungen am Cache-Konzept CACHE_VERSION erhöhen. */

const CACHE_VERSION = 'v209';
const CACHE_NAME = 'enyaq-' + CACHE_VERSION;

// Dateien, die beim Installieren vorab geladen werden
const SAME_ORIGIN_ASSETS = ['./', './index.html'];
const CDN_ASSETS = [
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(SAME_ORIGIN_ASSETS);
    // CDN-Dateien einzeln und "no-cors" laden (opake Antworten sind cachebar); ein Fehler bricht die Installation nicht ab
    await Promise.all(CDN_ASSETS.map(async (url) => {
      try { await cache.put(url, await fetch(new Request(url, { mode: 'no-cors' }))); }
      catch (err) { console.warn('[SW] Vorab-Caching fehlgeschlagen:', url, err); }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // alte Cache-Versionen entfernen
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith('enyaq-') && n !== CACHE_NAME).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== 'GET') return;                              // POST (KI-Abfrage) nie anfassen
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) return;
  if (!/^https?:$/.test(url.protocol)) return;
  // Fremde Hosts nur für die bekannten Skript-CDNs cachen – Firestore/Auth (Streaming, Login-Iframe/Popup) niemals anfassen
  const CDN_HOSTS = ['cdn.tailwindcss.com', 'cdn.jsdelivr.net', 'www.gstatic.com'];
  if (url.origin !== self.location.origin && !CDN_HOSTS.includes(url.hostname)) return;

  // Seitenaufrufe: Network first, offline -> gecachte index.html
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch (err) {
        return (await caches.match('./index.html')) || (await caches.match('./')) || Response.error();
      }
    })());
    return;
  }

  // Alles andere: Stale while revalidate
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    const network = fetch(req).then((res) => {
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    }).catch(() => cached);
    return cached || network;
  })());
});

/* ---- Push-Benachrichtigungen (Eis-Warnung am Vorabend, Testnachricht) ---- */
const PUSH_ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAAYFElEQVR42u2de7RkVX3nP3vvc+pU3bqPvrdft5+XbmwEGrAHUIcYlw4+EIgRVBh1EowRzRBNkKy4xomJw6xEzRjJShZJJJjAGh3E6DCAwQAjQZA3zUOaV2MDDf24/bjdfd91q+rsvX/545w6Vff2wwYdpupyfms195w6dU4V9fvu3/v322rDhg1CTq9b0vlPkAMgpxwAOeUAyCkHQE45AHLKAZBTDoCccgDklAMgpxwAOeUAyCkHQE45AHLKAZBTDoCccgDkNL8oeL38jyr1yt4vkgNg3pAXhY09R8tTBQSBRivJAdDRqx6IRTFdLxKWelEmSJa2ggwNrcepqBBnmZmZoFyoEipBcgB0LgLiGExXPwuWrUVpg6Q8J+X7wccK8ZbR4ReJa7sIC3MAkgOg81BgggBnY8RXEzarVMnPNQwkgYHSGhMGSE3Nb+6/XmwAcQ7vYsRLZhC2aoCGBGi8qLzCO4d6Hfw2rw8AiOBtjIjPJECDub7VFJDGZYWIzwEwX1SAeIv3MZL6dkoU0rDwRaV/JJMCSitogCUHQCcv/aZuF9sEgMz1Apij6r1CvDv49RwAHbj+FSAOb+NmdCdjuoJWSaASHSAA3r/i4FEOgHZgdsuSVUCsoOKF2NnDOP+HEgGKWIQS0HVQMEjNqyjhvAGAE0UtNggqceWAGvAeV+cDfg+V2LQkPuQQjG+ee6DLe27WBX4kEVH2LkEhRIHDzJMo4bwBQKUeQNRPodyHSmEAin1uhodclVrK4sOzfbZsKIgwYkoUgxIBICloatPjVGqj9ERxDoD2cfPAi6FU7iEsFBFxSQAIeK4QsQmVqfpWjgvNWFAjQkzLeQGhSDOHoJQBPDPVCUTieWEjzA8JkC5tW5tG4tpBhnuxwdHUUBBAZR5Boi4OdV2AauN6+kHexQlq5omBGMwX/oPg6zXQMXPTNx6FF58EeNJrjeNDvdY4bjC59b3eu9QWyAHQVgAwGibGx0hie2pWMEApjTb6qJkmgHe+GTmcYzz2dkfMlyxBMB/Y78XTFdT5Dx84hyiKcLFFpwpaacV0pcLIyD68c7OMAJljFDQMR200SxYvpqurlOQPFHgRTBBSr1V58O5b8ZIAq9Nh0PEA0FpRqVT56G9+kkv/8PMoD1o1rXmlwHmwcdwaLEClRmCrUahSWAhQCEK0nh019AJo+KuvL+D6b/8DXaUyvsODAh1dE6iUIq7XWbFyNR+76NPgwTuHtZ7YeazzxHWHd56oGBIEIUZrAhOgA4MJDIE2BCYgCAzKaMIgpBSFWO+pW4eLPc55rPV45/BO+OhFn2L5ilXEcR3V4a6A7uzVr6nVanzwwt9k6WAfztqEIS2unAkNYaDZvWeU2FoKocY5j3hBvOARRATnPYVQE1vHrpExwkATBCbNFqpMenjnGBzs4/wLfoNavYbSnV1XG3Qy86vVGYbWHss7znwvuNSiT4N84oUw1IzsH+dvrvnfPL91J/0Lerj4P72f004+lpmaz+wE5xylouGxJ1/gm9fdzOj4FOvWrOQzn/gQixf1EseS5hRS78AL73zXWdx8w/XsGt5BFEV473MJ8FqL/1qtxhtPOInVQ0up1Vzqw6s0MARhQXH3Az/lptvuYffIfu59+Am+94M70VohqZ8vqS2gteK7N9/BfQ9vYvfe/dx460/4yYNPUAgV3kv2PpSiVnUMHTPI8SeeTK1W7Wg10LEA8N4TRUVO2XB6YvQdIjYvAvU4xmhFIQwJTUCtHs8W65knAbV6TBAEFAohRitiaw+Z+FEKjIKTTjmVqNC5q38eACDi2Dcch7OkLhmz3DLvhDNOO4nTN5yIUoo1Q8s5511ngPfgXRr9k+yec9/9K6wdWo4C3vLv1nPGaSdhrRxS+lgLa9etIyoWkQ4GQMfaACKC1oaBhYtp/P4N/Y8kTJqpCsesHuQvvvRZtu/cw8CCbpYPLqRiFZQLiG28V6jMeN719lM54bg17D8wzuoVS+ntKVGtOZRuSQGnz/ceBgYWo7XG2mbcIQfAa4cAomLEgv7+xD9vFemqydh6rU65q8gpJx2DVTBjIRzbidr2KMGLd+P7V1J/+2dRylCrOgaX9LNqWT+1OtTqDq3VQWpFqQQQAwMDFAoR9XotlwCvtQEoIkTFEkZrVGr00SjqkTSAow1EBhuDPXCA8IW76dp8O8HOR9GjW1HxNPHy04jffDFS7EEpR1x31L2AVolxl0aDZS4IBIIgICqWmJwcz75TDoDXSPwrrZmemqQex6BKTd+/IQEUUJ0kePZeguduJ3juR6ipPShbg2IXdC9EJmIoL8aXe1CxRVRaTGKaq14OJdnT59frdSqVKZTSHcn8jlYBSim8tYyPjdLf35syoBHmtUipQHTPNZRu+BwSaCQqgykixb7kAdUZCHuITzw3MYVFIGOkmlUn0LD8m+dJXGB09ADO2Y52Azs6F2CdY/++EdasGco6fRJeaIgFe/w5zJznkCBCir1IcQEu6oGuBVDqh64BpNgDVY8TDc6jdZLgkXTpq0ah6EE6APbv24uzLo8E/v8gYwwzMxWe2vQ4v/K205mqCdpkyh9xHrtkHXbFH6BIEkTioVQAa6FaS1K+Ko7R2lAsGoIAqtUky+e8T6RBo2+AZk+B855SAZ7a9DgzMxVKpXKaOs4B8JqqAGstmx7fSGXmE2kzR1NnKxRiHcQOYxTX3fAjfvbiNs58+5s5ZtVyVq1YSl+PRtBMTwsvvrybl7bv4s57NvLGNwzxsQ++B2vnPC8FgtaG6WnLpp8+ineJp+BcLgFe80BQqVTmmaefYPMzz/GmDeuZqcRoY9J6v4byDoi98PATm/nJ/Y9x210Ps3b1clavGGTFsiWICMN7Rnh5x262vjxMrV7nzF89jQt//d1pE2GiWhpGXvK5IY8//iTPPPkEpa5yR0cCOzoQFIQBo6Oj3HTDdzjxpC8jGaNU01wXjwkMX7zst1m3dhWbnn6eLVu38eyWlwgCk9gS1jGwoJc3rV/Hm9av48IPvBttNNb6LA7Q2m1gHdx8w/VMjI/S3dOXlol1qCSdL5tG/fVV32bDhpOYqcRJwadSSQQvBUMQGKIIdu+dZOtLO9mxey87d+0DhBXLl7BqcDFrhlawdEkP1SqZdS9eQJJ+AAeUuwo8+vgmLrvkt5gPRWEdDwCtNTMzM5yy4XT+7Mq/p6+rhJRAeZAYSMO9SYu4oxAGRJFGhCzNGwYJSKo1h3UeZXSSW9AKAlAhiAY1A2NTFb742Yt56smfUiyWOtb4m1cSQCvFZK3GF9efwvuKEZWBxQTHn4A+fj3BscdBuQtMAAUDujUFnIKjpUdAe5DYg42R6Wn8C1twm5/Cbn6WrgMHuHWmwpef2URfsYTzvuMlQMfXBCrAiTAQRQxufCDJ8yuN/aGBsEA9imDxUtSKlejlK1ELFx1+ZJgIsm8EP7wTGd4OIyNQq0JcR6xFRBhUmoH+fmre0/klofOlMygJ/WC6yqiwkNT3OYc4B3GM3/YSbH0BF8eIs7MDOhmSEnYqE6DCEGUMyhh0GEJURIxGWUcQ1zHMn67xzpcAqasW1+vgBVuvEVudGIKSmoDagDEQRUfoDWiW/0qqE7wILo5B6niVtJohJJ8Vhh2bAJqlPjud+c45qpUKZ3/oI6w9YT2V4Z340VH89BQSJ9U/HsF7j7f2CP/i5G+c/nUWcS4R/d5DvU5leJi1J6zn7A/9R6qVaZz3HV8VbAYHBy/vVOvfWgtKccnv/SGfuuxSomPegOouYxYvQUVFqNeQ/ftgppLMi3MuqeRwNjl2ruXYgrNpS1iyspUIKghQzqEXL6F4wQWUP/FpzvjYR4iCEo898iDiPSYIOlYSdKQXoJTGOUsQBnzhS1/h7HPPwlU9KtLoALwFv2svfu8e/PAwbvcwbud2/I4d+P37kxWtmpPBVDohSpkAN7wDNT6OKRbRWqMLEfHe3eh3nUX/1d/AxSA1hyka/uWfb+N//NkXsdZijMnrAf5frvZWUeu9x9mYy/7L5fza+8+iOh1jjIGaw894MAa9dAlm1RI47eREr1sglrQWMNXzaedvdqw145d9FrnrXwmiKK31SyqCfb2OsxaqggoMcTXm/ee9j+npCl//6h9jjEm+Q0ukshNCxEF7r3SVln9XqdfqgFCIIuq1Ghd98jOc/+HzqU5btEongGqNNIpDY4fUfTr7R4FOC0d1kD47Xf6SzQdNe8oUPo6x9TriPcoEeGsJtIIgQLQFAa0N1WnL+Rd8kO3bXuTb115FlH43UBSiAlFUTNzSNpYMQTsz3zlHXK8ztOZYlq9YhTGGbS9v5fgTT+biS34fsZLm7xNPQJBMUggKlEm9hLTnT5pt3dnIuPTdyUwAlUkYiZOhUspLqjJUs4BYNSWTOMenP/M5Duzfx+Znn2T16jU479i5Yxvbtr5IWCi0tXoI2pb51lIslbj4kkt591nnMDg4iDGwffseenr7KIY6K8xIa3hAyZw6/tZCjsTNa234lkbWUDXTvVkZoPc0yo2FRtFhC/8bXqMoiqHmD75wOVOT46xcuRRrYfee3fzfW2/humuvpl6rtq2hGLQj8xt06ee/xAc/fC5xDZx1eA9Dq5YyU/VU655ioRGLa/SDHWn6V2N4lGSSPww1CFjnEe/RkUENLkNGD0BgwDowBpmuoJcOZsZi8tis9Jha3VEqFhjoW4qNLRrFquWD/M7vXszixYN87U//KPt/azcQtJ0baIxhanKCt77tHXzmss9Rr9isFBulcE4wWmj0a2jNIaZ8zA3xzJ38oTBas2PXPiamKizoKWeGoFmzLpEIQQG9dCl6cBnFs86h9KlLUOWeWc9XKKxLZocUjOC8oEhUkneOes2x7oQ38vSmTTy/ZXOaPJJcAhwxrCuCMQEnnXIqpYJmquZaijUbi10TKEmGNLSUA6vGwkRlM35UOvOHbOEKRiu+ftX13P7jB0Ep3vvOt/D53/koLgazYjk9X/4KUombsj5Kf6bYp5XD6QwhJThJQChpZiCzMlRiH3RFmhNO3sD9997Vliqg7SKB3nsKUYFVq48hjpNV6SXR3V5I/zamdiT/Zjd4zT5udcQECIxmeM8ot9/1EM55nHX86K6H2bNvjCBQ+Njhqx6CAEyABAHEHuoue1ZWKph2lzZcSZ+6lyI+7VNQ1OvC6tVrKLRpD2HbAUApRRzH7BvZiw7AOWn+6CmzG4zP5v7N3QREZNYxcyx/7302Or4BFu+b9d9JeiHNJTQ8ANUqaVJjs+FxyNzvlxifzgtBqBgZ2YuN47YMG7chADTOOh7deD+1WiLgnfPp6kr6/kUShhnddOKkhcmCamFusxVcKUVsPcuWDPCed74FYwyBMZz1zn/P4JJ+YuubLuQh7m9+lmqqK62wXnDS/F6C4Fwya7hWg8c23o9zrqWBNQ8F/1wpUK3O8LuXfoHf+tTHqVaSIQ6NFZowH0KjZg98bpX1h9oXpsV4Q8Hwnn0gsHxwURpHIIspHOn+Wb6gCLEXnG8UmCgEjzEBpRJcc/W1XHXl19rSAGzrXEBiuHnee/Z5XPTb/5klS5emFTgKoxWhSRM2Ss0O7BzFuSBEocaYdIiUg2rNH/X9redJF5FgfaKuBMFozZ49e/j2Nd/g9n/5wUENprkbeDS6SSmU0jy28QEmJid4x5lnEWghNAqTKv9G1XYjtHu054HRPLV5K9f9nzu4f+MzdJXKDC7unzXx62ifl/2QWmE06fQRxdf//L/xgxu+S1e5i3aeKdu2oeDEHTREpRLl7m6MboZqhYPjPXIU55IyanK6yuVX/APbduwB4J4Hf8o1f/UnlLuixJdXR/e82eeSGlWCMppyVzfFUgmtdVN9teNCo41JSHR/34IBlG4x9tTsGJ/MVR2HeQ0EbRQj+8cYG59moL+Xgf5exiamGTkwhjHNgNGh7z+6z1IaFvT345xt+70F2hoAisTq7+rqwhgy160x6Ttzy1piAaolCCBzricROmFhfx+LBvoYHZtgdGyCRQN9LOrvw6WTxg53f+vzD/f5iWcA5XJ3Ok20vQEQtLsEUFoxNTmR9N4pdcQVeTTn1nl6e0r819//OLfeeT9KKc4+8wx6ukvE1jUjh6/y+aBwHqanpw56Vg6AV24IoLVmdPQA3pGldn/O1p9HdAeTWIDjlBPX8qunrgVgogb1dBbQK3EnD/d87+HA/v1JqrrNdUDbVwRppRkfHcU6R6gbcf1ZG71m/83Ku1r7++dcRyWGYD32PLRlB0rB2qGVaK1bRPbh7z/ydUm7lh3jYwfSWoVcAvxCnoDWmtGx/Wm2Ts8eBdZqhs9J+x72uihEwd9e833uvO8RQHHm207j9z55QRbTV+rVPr9RUOoZHU0A0O51gm0PUR0Ydu3YxvjYGBzEGJXF4I/mXCTZFn778Ai33HEflUqNSqXKD++4j+279mIC/YqeN/u8EURWjI0eYNfO7Zh0s+ocAL9ILEAHTE5O8tgjDxGG0kzazMr5He152ilsDEZr6nFMPY7ROpkSnkV4XtXzkxB1UIBHNz7E1OQEOgja3gZofwmgNdVqhcc2PoAyKgOAiMr08NGeA9Rjx7Kli/j4hedy7NAKjh1awUUXnsOyJQuJY58x7JU/P5k+rhQ8+vD9VKvV3Ab4ZTmDQRCy5bln2L1rnIUDvdjYp/s2qTnbvbUUZGT7Ac2+rlQy4+c3Pvwe3nfmGaBg0UA3tarPrDw5wv2HfH5akBpGAbt2jfH8ls2EYUgn7DDZ9hBNRrJ0seW5Z3nkoXsJQpX15EtLRGbWRlGtrx3memUmprenm76ebioz7hXfP+t6OkgiCBWPPHQvz/9sM8VSqSP6AjqiNzAZDKn43nXXMj5eS+YA0cjby0GpXGl1zeZcl3RAtNIa6xzWumSCWMO6P8r7SbenzMrNjWF8vMo/XXdtNo6+E6hjAFAsltj87FPc9sObKBY11nlm7QapVMa4rAhUqabbpppbv2UxhMY42LQ+4JXcL40YMEn/QqmkufWWG/nZs0+3be6/YwHQahDe9P3r2Lt3lDDUSFqRK42dH2ip9QdIq3MOeV2auvvV3w/iPWEhYM/uA9z0/e9k0qljftNO+aINW+CFLZu59upvEISmKaJVS4BGyaxVe/BrLcf8nOtHur+lHtAYzT/+/d/w4vPPUeoQ3d+REsA5R1e5hxv+6Vt89399h65ygLXNZk9JOz4aq7S5elV2nl1XP+f6Ee9P9L61jq7ugO9861vc+L3r6Cr3tHXuv+MB0LC9o2KRq678Gnf961309BWIbTwnGtsU0Uq1lAz/Eq43NLu1jp7eAnfe8WOu/rsrKJZKdOLgmI4DQGOnEOccV/z5f2fjg4/T05fU3DdWrG+xDX3WCt68/xe5DoL3jp6+Ag8/+BhXfPVyfDpkuhPnA3TohBAhCAImJye45+476F+4jPUnH0+95kE8WmmaWrtp9TdtfPWqrjvvQaDcHXLLD37IVy//AhPjY0RR1LETQjp2RIyIEIbJXr73/PgOkJDT3/pmtDbEcZzs4fPLKseRZHJoMSpgAs2137yaK6/4Cs7FFAqFjp4V3LEAaFUHWmseuO8uRvbu4w3HHcfiJf14r3HWZw3huqHtZu0V3LJFfHMseHI53VlU8JggpFwO2LljJ1f+5de4/n9+k6hYRGvT8VPC5sWk0MYkkampSVasHOJ9v3Yev37+RxhcthBIav6djQGdlnMf3FAiLUV/4j1BGBJFGhTsGh7hn2/8HrfdciPDO7ZR7u5p+8kfrysAZBatMdSrVeK4zrIVqzjvwx/j1NPfyqqhtSxe0oVNB4UlLWZNY1GptM1cJeMETQj79k6z/eWtPLrxwWSL2J3bCcMChWIx3YZ+ftC8AkAjWggQxzEzlWkGFi1maGgta9e9kRPWn8LAwkV09/TS27eA3t5k/6CJiXEmxsaYmprgwP4RNj/9JM9v2cy2l7ZyYP8Ipa4yYRgmnuA8mA88rwHQqhYaswSr1Zl0C/kiQRAk49+0wRidBpg83ju891hrqVWrGKOJiiWCIEhcTJmXP9P8mBV8OAPROYfWmnK5O03Z+ux15yz1elMFJD1+ijAMKURRkidI3zufKWCe06GMtUYG8FBeoogkQ6ZfJ6TJ6XVNOQByAOSUAyCnHAA55QDIKQdATjkAcsoBkFMOgJxyAOSUAyCnHAA55QDIKQdATjkAcsoBkFMOgJxyAOSUAyCnHAA55QDIKQdATjkAcsoBkFPn0r8BF0hPN8gLBNYAAAAASUVORK5CYII=';
const PUSH_BADGE = 'data:image/png;base64,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';
self.addEventListener('push', (event) => {
  let d = {}; try { d = event.data ? event.data.json() : {}; } catch (e) { d = { title: 'EnyaqStrom', body: event.data ? event.data.text() : '' }; }
  event.waitUntil(self.registration.showNotification(d.title || 'EnyaqStrom', {
    body: d.body || '', tag: d.tag || 'enyaq', renotify: true, badge: PUSH_BADGE, icon: PUSH_ICON,   // Bilder eingebettet: beim Aufwecken aus dem Ruhezustand ist oft kein Netz da, sonst zeigt Android „E“ und eine Glocke
    data: { url: d.url || '/' }, actions: [{ action: 'open', title: 'Details' }, { action: 'close', title: 'OK' }]
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close(); if (event.action === 'close') return;
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) { if (new URL(c.url).origin === self.location.origin) { await c.focus(); return; } }
    await self.clients.openWindow(url);
  })());
});
