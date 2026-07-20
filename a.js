const axios = require('axios');
const cheerio = require('cheerio');

const providers = {
    Giphy: {
        re: /((http|https):\/\/)?(www\.)?giphy\.com\/gifs\/(([a-z-]+)(?<=-))?([a-zA-Z0-9-]+)/i,
        idx: 6,
        op: 'https://media.giphy.com/media/{}/source.gif',
        ext: 'gif',
        scrape: null
    },
    Tenor: {
        re: /((http|https):\/\/)?(www\.)?tenor\.com\/view\/(.*)(?=-)-gif-(\d+)/i,
        idx: 4,
        op: null,
        ext: 'gif',
        scrape: "$('meta[property=\"og:image\"]')?.attr('content')"
    },
    'Tenor : Source': {
        re: /((http|https):\/\/)?media\d\.tenor\.co\/images\/([a-f0-9]+)\/tenor\.gif/i,
        idx: 3,
        op: null,
        ext: 'gif',
        scrape: 'url_input'
    },
    Gfycat: {
        re: /((http|https):\/\/)?(www\.)?gfycat\.com\/([a-z-]+)/i,
        idx: 4,
        op: null,
        ext: 'gif',
        scrape: "$('meta[property=\"og:url\"]')?.attr('content')"
    },
    'Reaction GIFs': {
        re: /((http|https):\/\/)?(www\.)?reactiongifs\.com\/([a-z0-9-]+)/i,
        idx: 4,
        op: null,
        ext: 'gif',
        scrape: "$('meta[property=\"og:image\"]')?.attr('content')"
    },
    // GIFbin: {
    //     re: /((http|https):\/\/)?(www\.)?gifbin\.com\/(\d+)/i,
    //     idx: 4,
    //     op: null,
    //     ext: 'mp4',
    //     scrape: "$('source[type=\"video/mp4\"]')?.attr('src')"
    // },
    Imgflip: {
        re: /((http|https):\/\/)?(www\.)?imgflip\.com\/gif\/([a-z0-9]+)/i,
        idx: 4,
        op: 'https://i-download.imgflip.com/{}.gif',
        ext: 'gif',
        scrape: null
    },
    Tumblr: {
        re: /((http|https):\/\/)?\w+\.tumblr\.com\/post\/(\d+)/i,
        idx: 3,
        op: null,
        ext: 'gif',
        scrape: "$('meta[property=\"og:image\"]')?.attr('content')?.slice(0, -1)"
    },
    // Twitter: {
    //     re: /((http|https):\/\/)?(www\.)?twitter\.com\/(.*)(?<=status\/)(\d+)/i,
    //     idx: 5,
    //     op: null,
    //     ext: 'mp4',
    //     scrape:
    //         "(function(){ const img = $('meta[property=\"og:image\"]')?.attr('content'); return img ? 'https://video.twimg.com/tweet_video/' + img.slice(0,-4).split('/').pop() + '.mp4' : null; })()"
    // },
    // Imgur: {
    //     re: /((http|https):\/\/)?i\.imgur\.com\/([A-Za-z0-9]+)/i,
    //     idx: 3,
    //     op: null,
    //     ext: 'mp4',
    //     scrape: "$('meta[property=\"og:video\"]')?.attr('content')"
    // },
    // 'Imgur : Source': {
    //     re: /((http|https):\/\/)?(www\.)?imgur\.com\/(gallery|\w)\/([a-z]+\/)?([A-Za-z0-9]+)/i,
    //     idx: 6,
    //     op: null,
    //     ext: 'mp4',
    //     scrape: 'url_input'
    // },
    Reddit: {
        re: /((http|https):\/\/)?((www|old)\.)?reddit\.com\/r\/(.*)(?<=comments\/)([a-z0-9_\/]+)/i,
        idx: 6,
        op: null,
        ext: 'gif',
        scrape:
            '(await axios.get(url_input + ".json", { headers: { "User-Agent": "Mozilla/5.0" } })).data'
    },
    // '9GAG': {
    //     re: /((http|https):\/\/)?(www\.)?9gag\.com\/\w+\/([A-Za-z0-9]+)/i,
    //     idx: 4,
    //     op: 'https://img-9gag-fun.9cache.com/photo/{}_460sv.mp4',
    //     ext: 'mp4',
    //     scrape: null
    // },
    // Sizzle: {
    //     re: /((http|https):\/\/)?(www\.)?onsizzle\.com\/i\/([A-Za-z0-9-]+)(?=-)-([a-f0-9]+)/i,
    //     idx: 4,
    //     op: null,
    //     ext: 'mp4',
    //     scrape: "$('source[type=\"video/mp4\"]')?.attr('src')"
    // },
    'PANA.GIFS': {
        re: /((http|https):\/\/)?(www\.)?panagif\.com\/gif\/([A-Za-z0-9-]+)/i,
        idx: 4,
        op: null,
        ext: 'gif',
        scrape: "$('source[type=\"image/gif\"]')?.attr('src')"
    },
    Gifer: {
        re: /((http|https):\/\/)?(www\.)?gifer\.com(\/\w\w)?\/([A-Za-z0-9]+)/i,
        idx: 5,
        op: 'https://i.gifer.com/embedded/download/{}.gif',
        ext: 'gif',
        scrape: null
    },
    // TikTok: {
    //     re: /((http|https):\/\/)?(www\.)?tiktok\.com\/@(.*)(?<=video\/)(\d+)/i,
    //     idx: 5,
    //     op: null,
    //     ext: 'mp4',
    //     scrape: "$('video')?.attr('src')"
    // }
};

async function extractUrl(url, script) {
    let $ = null;

    if (script.includes("$(")) {
        const { data } = await axios.get(url, {
            headers: {
                "User-Agent": "Mozilla/5.0"
            }
        });

        $ = cheerio.load(data);
    }

    const fn = new Function(
        "$",
        "url_input",
        "axios",
        `
        return (async () => {
            return ${script};
        })();
        `
    );

    return await fn($, url, axios);
}

async function getDirectUrl(urlInput) {
    if (!/^https?:\/\//i.test(urlInput)) {
        urlInput = "https://" + urlInput;
    }

    for (const [name, provider] of Object.entries(providers)) {
        const match = urlInput.match(provider.re);

        if (!match) continue;

        const id = match[provider.idx]?.replace(/\//g, "-");

        let mediaUrl;

        if (provider.scrape) {
            mediaUrl = await extractUrl(urlInput, provider.scrape);

            // Reddit special handling
            if (name === "Reddit") {
                const txt = JSON.stringify(mediaUrl);
                const found = txt.match(
                    /https:\/\/preview\.redd\.it\/[a-z0-9]+\.gif\?s=[a-f0-9]+/i
                );

                mediaUrl = found?.[0];
            }
        } else {
            mediaUrl = provider.op.replace("{}", id);
        }

        return {
            provider: name,
            id,
            url: mediaUrl
        };
    }

    // check if the url is image or gif link use const { fileTypeFromBuffer } = require("file-type");
    const { fileTypeFromBuffer } = require("file-type");
    try {
        const response = await axios.get(urlInput, {
            responseType: "arraybuffer",
            timeout: 15000,
            maxContentLength: 20 * 1024 * 1024,
            headers: {
                "User-Agent": "Mozilla/5.0"
            }
        });

        const buffer = Buffer.from(response.data);

        const file = await fileTypeFromBuffer(buffer);

        if (file && (file.mime.startsWith("image/") || file.mime === "image/gif")) {
            return {
                provider: "direct",
                id: null,
                type: file.mime,
                url: urlInput,
                buffer
            };
        }
    } catch (err) {
        // ignore errors
    }

    return {
        provider: null,
    };
}

module.exports = {
    getDirectUrl
};