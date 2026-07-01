































if (typeof process !== 'undefined' && typeof globalThis.fetch !== 'undefined') {
    const _origFetch = globalThis.fetch.bind(globalThis);
    globalThis.fetch = async (url, init) => {
        const s = typeof url === 'string' ? url : (url && url.url);
        if (typeof s === 'string' && s.startsWith('file://')) {
            const { readFileSync } = await import('node:fs');
            const data = readFileSync(new URL(s).pathname);
            const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
            return {
                ok: true, status: 200,
                arrayBuffer: async () => buf,
                blob: async () => new Blob([buf]),
                json: async () => JSON.parse(data.toString('utf8')),
                text: async () => data.toString('utf8'),
            };
        }
        return _origFetch(url, init);
    };
}

const PIPER_VERSION = '1.4.2';
const DEFAULT_VOICE = 'en_US-amy-low.onnx';


const PAD = '_'; 
const BOS = '^'; 
const EOS = '$'; 

const DEFAULT_NOISE_SCALE = 0.667;
const DEFAULT_LENGTH_SCALE = 1.0;
const DEFAULT_NOISE_W_SCALE = 0.8;
const MAX_WAV_VALUE = 32767.0;


const RS = '\x1e'; 
const US = '\x1f'; 

const PHONEME_BLOCK_RE = /(\[\[.*?\]\])/s;
const LANG_FLAG_RE = /\([^)]+\)/g;





function espeakPhonemize(espeak, voice, text) {
    const ptr = espeak.ccall('piper_espeak_phonemize', 'number',
        ['string', 'string'], [voice, text]);
    if (!ptr) {
        throw new Error(`espeak failed to phonemize with voice "${voice}"`);
    }
    const raw = espeak.UTF8ToString(ptr);
    espeak._free(ptr);

    const all = [];
    let sentence = [];
    if (raw.length === 0) return all;

    for (const clause of raw.split(RS)) {
        const [eos, term, phon] = clause.split(US);
        
        let phonemesStr = phon.replace(LANG_FLAG_RE, '');
        // Keep punctuation even though it isn't technically a phoneme.
        phonemesStr += term;
        if (term === ',' || term === ':' || term === ';') {
            phonemesStr += ' '; 
        }
        
        for (const ch of phonemesStr.normalize('NFD')) sentence.push(ch);

        if (eos === '1') {
            all.push(sentence);
            sentence = [];
        }
    }
    if (sentence.length) all.push(sentence);
    return all;
}



function phonemizeText(espeak, voice, text) {
    const phonemes = [];
    const parts = text.split(PHONEME_BLOCK_RE);
    let prevRaw = false;

    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (part.startsWith('[[')) {
            prevRaw = true;
            if (phonemes.length === 0) phonemes.push([]);
            const last = phonemes[phonemes.length - 1];
            if (i > 0 && parts[i - 1].endsWith(' ')) last.push(' ');
            for (const ch of part.slice(2, -2).trim()) last.push(ch);
            if (i < parts.length - 1 && parts[i + 1].startsWith(' ')) last.push(' ');
            continue;
        }

        let partPhonemes = espeakPhonemize(espeak, voice, part);
        if (prevRaw && partPhonemes.length) {
            
            const last = phonemes[phonemes.length - 1];
            for (const ch of partPhonemes[0]) last.push(ch);
            partPhonemes = partPhonemes.slice(1);
        }
        for (const s of partPhonemes) phonemes.push(s);
        prevRaw = false;
    }

    if (phonemes.length && phonemes[phonemes.length - 1].length === 0) {
        phonemes.pop();
    }
    return phonemes;
}



function phonemesToIds(phonemes, idMap) {
    const ids = [];
    const push = (arr) => { for (const x of arr) ids.push(x); };
    push(idMap[BOS]);
    push(idMap[PAD]);
    for (const phoneme of phonemes) {
        const mapped = idMap[phoneme];
        if (!mapped) continue; 
        push(mapped);
        push(idMap[PAD]);
    }
    push(idMap[EOS]);
    return ids;
}



function floatToInt16(audio) {
    const out = new Int16Array(audio.length);
    for (let i = 0; i < audio.length; i++) {
        let v = audio[i] * MAX_WAV_VALUE;
        if (v > MAX_WAV_VALUE) v = MAX_WAV_VALUE;
        else if (v < -MAX_WAV_VALUE) v = -MAX_WAV_VALUE;
        out[i] = v < 0 ? (v - 0.5) | 0 : (v + 0.5) | 0;
    }
    return out;
}

function buildWav(int16, sampleRate) {
    const numSamples = int16.length;
    const dataBytes = numSamples * 2;
    const buf = new ArrayBuffer(44 + dataBytes);
    const view = new DataView(buf);
    const w = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
    w(0, 'RIFF');
    view.setUint32(4, 36 + dataBytes, true);
    w(8, 'WAVE');
    w(12, 'fmt ');
    view.setUint32(16, 16, true);     
    view.setUint16(20, 1, true);      
    view.setUint16(22, 1, true);      
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); 
    view.setUint16(32, 2, true);      
    view.setUint16(34, 16, true);     
    w(36, 'data');
    view.setUint32(40, dataBytes, true);
    new Int16Array(buf, 44).set(int16);
    return new Uint8Array(buf);
}



export default async function createPiper(options = {}) {
    const {
        locateFile = null,
        ortBase = null,        
        voice = DEFAULT_VOICE, 
        numThreads = null,     
        print = null,
        printErr = null,
    } = options;

    const resolve = (file) =>
        locateFile ? locateFile(file) : new URL(file, import.meta.url).href;

    
    const espeakUrl = new URL('espeakng.mjs', import.meta.url).href;
    const createEspeak = (await import(espeakUrl)).default;
    const espeak = await createEspeak({
        locateFile: (f) => resolve(f),
        ...(print ? { print } : {}),
        ...(printErr ? { printErr } : {}),
    });
    if (espeak.ccall('piper_espeak_init', 'number', ['string'], ['/espeak-ng-data']) < 0) {
        throw new Error('failed to initialize espeak-ng');
    }

    
    
    
    
    
    
    const ortDir = ortBase
        ? new URL(ortBase, import.meta.url).href
        : new URL('./', import.meta.url).href;
    const ort = await import(new URL('ort.wasm.min.mjs', ortDir).href);
    ort.env.wasm.wasmPaths = ortDir;
    
    
    
    
    
    const isNode = typeof process !== 'undefined' && !!process.versions?.node;
    const hasSAB = typeof SharedArrayBuffer !== 'undefined';
    ort.env.wasm.numThreads = numThreads != null
        ? numThreads
        : (!isNode && hasSAB ? Math.min(4, (globalThis.navigator?.hardwareConcurrency) || 4) : 1);

    
    let session = null;
    let config = null;
    let espeakVoice = 'en-us';

    async function readBytes(file) {
        const url = resolve(file);
        if (typeof process !== 'undefined') {
            const { readFileSync } = await import('node:fs');
            const p = url.startsWith('file://') ? new URL(url).pathname : url;
            const d = readFileSync(p);
            return new Uint8Array(d.buffer, d.byteOffset, d.byteLength);
        }
        const resp = await fetch(url);
        return new Uint8Array(await resp.arrayBuffer());
    }

    
    
    async function loadVoice(model, cfg) {
        const bytes = model instanceof Uint8Array ? model : new Uint8Array(model);
        config = typeof cfg === 'string' ? JSON.parse(cfg) : cfg;
        if (!config || !config.phoneme_id_map) {
            throw new Error('voice config is missing phoneme_id_map');
        }
        espeakVoice = config.espeak?.voice || 'en-us';
        session = await ort.InferenceSession.create(bytes.buffer.slice(
            bytes.byteOffset, bytes.byteOffset + bytes.byteLength), {
            executionProviders: ['wasm'],
        });
        return config;
    }

    
    if (voice) {
        const model = await readBytes(voice);
        const cfgText = new TextDecoder().decode(await readBytes(`${voice}.json`));
        await loadVoice(model, cfgText);
    }

    function requireVoice() {
        if (!session || !config) {
            throw new Error('no voice loaded — call loadVoice() first');
        }
    }

    
    async function infer(phonemeIds, opts) {
        const inf = config.inference || {};
        const noiseScale = opts.noiseScale ?? inf.noise_scale ?? DEFAULT_NOISE_SCALE;
        const lengthScale = opts.lengthScale ?? inf.length_scale ?? DEFAULT_LENGTH_SCALE;
        const noiseWScale = opts.noiseWScale ?? inf.noise_w ?? DEFAULT_NOISE_W_SCALE;
        const numSpeakers = config.num_speakers || 1;

        const ids = BigInt64Array.from(phonemeIds, (v) => BigInt(v));
        const feeds = {
            input: new ort.Tensor('int64', ids, [1, ids.length]),
            input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(ids.length)]), [1]),
            scales: new ort.Tensor('float32', Float32Array.from([noiseScale, lengthScale, noiseWScale]), [3]),
        };
        if (numSpeakers > 1) {
            const sid = opts.speakerId ?? 0;
            feeds.sid = new ort.Tensor('int64', BigInt64Array.from([BigInt(sid)]), [1]);
        }

        const results = await session.run(feeds);
        
        const audioOut = results[session.outputNames[0]];
        return audioOut.data; 
    }

    
    async function synthesize(text, opts = {}) {
        requireVoice();
        const normalize = opts.normalizeAudio !== false; 
        const volume = opts.volume ?? 1.0;

        const sentences = phonemizeText(espeak, espeakVoice, text);
        const chunks = [];
        let totalLen = 0;

        for (const phonemes of sentences) {
            if (!phonemes.length) continue;
            const ids = phonemesToIds(phonemes, config.phoneme_id_map);
            let audio = await infer(ids, opts);

            
            audio = Float32Array.from(audio); 
            if (normalize) {
                let maxVal = 0;
                for (let i = 0; i < audio.length; i++) {
                    const a = Math.abs(audio[i]);
                    if (a > maxVal) maxVal = a;
                }
                if (maxVal < 1e-8) audio.fill(0);
                else for (let i = 0; i < audio.length; i++) audio[i] /= maxVal;
            }
            if (volume !== 1.0) {
                for (let i = 0; i < audio.length; i++) audio[i] *= volume;
            }
            const int16 = floatToInt16(audio);
            chunks.push(int16);
            totalLen += int16.length;
        }

        const merged = new Int16Array(totalLen);
        let off = 0;
        for (const c of chunks) { merged.set(c, off); off += c.length; }
        return buildWav(merged, config.audio?.sample_rate || 22050);
    }

    
    function phonemize(text) {
        return phonemizeText(espeak, espeakVoice, text);
    }
    
    function toIds(phonemes) {
        requireVoice();
        return phonemesToIds(phonemes, config.phoneme_id_map);
    }

    return {
        synthesize,
        loadVoice,
        phonemize,
        phonemesToIds: toIds,
        espeak,
        ort,
        get config() { return config; },
        get sampleRate() { return config?.audio?.sample_rate || 22050; },
        version: PIPER_VERSION,
    };
}
