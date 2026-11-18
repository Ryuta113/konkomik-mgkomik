// ID: ext_mgkomik
// NAME: MGKOMIK
// TYPE: comic
// VERSION: 0.4.2
// COLOR: #E50914
// ICON: https://id.mgkomik.cc/wp-content/uploads/2021/04/cropped-Retina-Logo-e1667188792992-1-192x192.png
// REFERER: https://web1.mgkomik.cc/

const BASE = 'https://web1.mgkomik.cc';
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
    'Referer': BASE + '/',
    'Accept': 'text/html,application/xhtml+xml',
    'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
};

async function fetchHtml(url) {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.text();
}

function pick(re, str, def) {
    const m = re.exec(str);
    return m ? m[1] : (def === undefined ? '' : def);
}

function decode(s) {
    return s
        .replace(/&#0?39;|&#8217;|&rsquo;/g, "'")
        .replace(/&quot;|&#8220;|&#8221;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&');
}

// teks satu baris
function clean(s) {
    if (!s) return '';
    return decode(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

// teks dengan paragraf dipertahankan (untuk sinopsis)
function cleanMultiline(s) {
    if (!s) return '';
    return decode(s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''))
        .replace(/[ \t]+/g, ' ')
        .replace(/\n\s*\n\s*\n+/g, '\n\n')
        .trim();
}

function toAbs(u) {
    if (!u) return '';
    if (u.indexOf('//') === 0) return 'https:' + u;
    if (u.charAt(0) === '/') return BASE + u;
    return u;
}

function slugOf(idOrUrl) {
    const m = /\/komik\/([^\/?#]+)/.exec(idOrUrl);
    return m ? m[1] : idOrUrl.replace(/^\/+|\/+$/g, '');
}

// Parsing kartu komik (class "manga-card") tanpa regex lazy raksasa
function parseCards(html) {
    const list = [];
    const seen = {};
    const parts = html.split('class="manga-card"');
    for (let i = 1; i < parts.length; i++) {
        const block = parts[i];
        const slug = pick(/data-slug="([^"]+)"/, block);
        if (!slug || seen[slug]) continue;
        seen[slug] = true;

        const coverTag = pick(/<img[^>]*class="manga-cover"[^>]*>/, block, '');
        let coverUrl = pick(/\bsrc="([^"]+)"/, coverTag);
        if (!coverUrl) coverUrl = pick(/<img[^>]*src="([^"]+)"/, block);

        const title = clean(pick(/class="manga-title">([\s\S]*?)<\/div>/, block));
        // beranda: <a class="chapter-capsule">, pencarian: <span class="chapter-capsule" data-url=...>
        const chapter = clean(pick(/class="chapter-capsule"[^>]*>([\s\S]*?)<\/(?:a|span)>/, block));
        const flag = pick(/class="flag-badge"\s+title="([^"]+)"/, block);

        list.push({
            id: slug,
            title: title || slug.replace(/-/g, ' '),
            cover_url: toAbs(coverUrl),
            latest_chapter: chapter,
            rating: '-',
            views: flag || '-',
        });
    }
    return list;
}

function debugCard(title, info) {
    return {
        id: 'debug',
        title: 'DEBUG: ' + title,
        cover_url: '',
        latest_chapter: String(info).substring(0, 200),
        rating: '-',
        views: '-',
    };
}

var KonmikExtension = {
    async getList(page, query, filters) {
        page = page || 1;
        const sort = filters && filters.sort ? filters.sort : 'latest';
        let url;
        if (query && query.trim()) {
            // pencarian: /search/?q=blue&page=2
            url = BASE + '/search/?q=' + encodeURIComponent(query.trim()) + (page > 1 ? '&page=' + page : '');
        } else if (sort === 'popular') {
            // pustaka urut "Most Views" (parameter order_by dari filter situs)
            url = BASE + '/search/?order_by=views&page=' + page;
        } else {
            // beranda: grid "Komik Update", 24 item/halaman
            url = BASE + '/?&page=' + page;
        }
        // MODE DIAGNOSIS: kalau gagal/kosong, tampilkan penyebabnya sebagai satu kartu "komik"
        let html = '';
        try {
            const res = await fetch(url, { headers: HEADERS });
            html = await res.text();
            if (!res.ok) {
                return { manga_list: [debugCard('HTTP ' + res.status, url + ' | ' + html.substring(0, 120).replace(/\s+/g, ' '))] };
            }
        } catch (e) {
            return { manga_list: [debugCard('FETCH ERROR', String(e && e.message ? e.message : e))] };
        }
        const list = parseCards(html);
        if (list.length === 0) {
            // tampilkan teks halaman yang diterima, dipecah ke beberapa kartu (judul kartu pendek)
            const text = clean(html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' '));
            const cards = [debugCard('0 HASIL len=' + html.length, '')];
            for (let i = 0; i < 6; i++) {
                const part = text.substring(i * 40, (i + 1) * 40);
                if (part) cards.push(debugCard(part, ''));
            }
            return { manga_list: cards };
        }
        return { manga_list: list };
    },

    async getDetail(idOrSlug) {
        const slug = slugOf(idOrSlug);
        const html = await fetchHtml(BASE + '/komik/' + slug + '/');

        const title = clean(pick(/<h1[^>]*class="manga-title"[^>]*>([\s\S]*?)<\/h1>/, html)) ||
            clean(pick(/<h1[^>]*>([\s\S]*?)<\/h1>/, html));

        let cover = pick(/property="og:image"\s+content="([^"]+)"/, html);
        if (!cover) cover = pick(/class="manga-cover-large"[^>]*>/, html) && pick(/<img[^>]*src="([^"]+)"[^>]*class="manga-cover-large"/, html);

        // sinopsis (HTML mentah berisi <p> di dalam #sinopsisContainer)
        let desc = cleanMultiline(pick(/id="sinopsisContainer">\s*<p>([\s\S]*?)<\/p>/, html));
        if (!desc) desc = clean(pick(/property="og:description"\s+content="([^"]+)"/, html));

        // judul alternatif (ada di variabel JS alternativeText)
        const alt = decode(pick(/const alternativeText = '([^']*)'/, html)).trim();
        if (alt) desc = (desc ? desc + '\n\n' : '') + 'Judul alternatif: ' + alt;

        const genres = [];
        const gRe = /class="genre-tag">\s*([^<]+?)\s*<\/a>/g;
        let g;
        while ((g = gRe.exec(html)) !== null) {
            const name = clean(g[1]);
            if (name && genres.indexOf(name) < 0) genres.push(name);
        }

        // daftar chapter: split per <li class="chapter-list-item">, urutan asli situs (terbaru dulu)
        const chapters = [];
        const seen = {};
        const parts = html.split('class="chapter-list-item"');
        for (let i = 1; i < parts.length; i++) {
            const block = parts[i];
            const href = pick(/<a[^>]*href="([^"]+)"[^>]*class="chapter-link"/, block) ||
                pick(/<a[^>]*class="chapter-link"[^>]*href="([^"]+)"/, block);
            if (!href) continue;
            const abs = toAbs(href);
            if (seen[abs]) continue;
            seen[abs] = true;
            const num = pick(/class="chapter-number">([\s\S]*?)<\/span>/, block);
            const date = pick(/class="chapter-date">([\s\S]*?)<\/span>/, block);
            chapters.push({
                id: abs,
                title: clean(num) || ('Chapter ' + pick(/data-chapter-number="([^"]+)"/, block)),
                endpoint: abs,
                date: clean(date),
            });
        }

        return {
            title: title,
            cover_url: toAbs(cover),
            description: desc,
            author: '-',
            artist: '-',
            rating: '-',
            views: '-',
            genres: genres,
            chapters: chapters,
        };
    },

    async getChapterImages(endpoint) {
        const url = endpoint.indexOf('http') === 0 ? endpoint : BASE + endpoint;
        const html = await fetchHtml(url);

        // Gambar halaman ada di <div class="reading-content" id="readingContent"> ... sebelum <div id="pageNav">
        const start = html.indexOf('id="readingContent"');
        let section = html;
        if (start >= 0) {
            const end = html.indexOf('id="pageNav"', start);
            section = html.substring(start, end > start ? end : html.length);
        }

        const images = [];
        const seen = {};
        const re = /<img[^>]+src="(https?:[^"]+)"/gi;
        let m;
        while ((m = re.exec(section)) !== null) {
            const u = m[1];
            if (start < 0 && /banner|flagcdn|logo|favicon|avatar|placehold|\.gif/i.test(u)) continue;
            if (seen[u]) continue;
            seen[u] = true;
            images.push(u);
        }
        return images;
    },
};
