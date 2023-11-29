const { OpenAI } = require('openai');
const { API_KEY } = require('./config.json');
const fs = require('fs');

const openai = new OpenAI({ apiKey: API_KEY });

// Load post titles
const loadData = () => {
    let safe = fs.readFileSync('./safe.txt', 'utf8').split('\n');
    let threat = fs.readFileSync('./threat.txt', 'utf8').split('\n');

    return { safe, threat };
}

// Pick 90 random titles from safe and combine it with threat. Then shuffle the array and return it.
const shuffle = () => {
    let { safe, threat } = loadData();

    let shuf = [...(safe.sort(() => Math.random() - Math.random()).slice(0, 90).map(v => ({ threat: false, data: v }))), ...(threat.map(v => ({ threat: true, data: v })))];
    shuf.sort(() => Math.random() - Math.random());

    return shuf;
}

// Compare expected and actual results
const compare = (expected, actual) => {
    let safe_correct = 0, threat_correct = 0;

    for (let i = 0; i < expected.length; i++) {
        if (!expected[i] && !actual[i]) safe_correct++;
        if (expected[i] && actual[i]) threat_correct++;
    }

    return { safe_correct, threat_correct };
}

let basePrompt = `Beda is a content moderator working for a korean online community website. Beda is given with 100 titles of posts in Korean to review. Beda individually judges each post as either safe or unsafe based on whether if it contains content of public threat. Beda defines public threat as advance notices that perpetrators upload before committing terror to public places. Beda must be considerate to keep the public safe. Beda must report the judgements in a JSON array format of length 100 where public threat is marked as true and safe posts are marked as false, like this: [true, false, true, true, ...]. Beda should not include any other text in the response else than the JSON parsable array. You are Beda.`;

// If the text starts with ```json, remove it as well as the last ``` 
const cleanText = (text) => {
    if (text.startsWith('```json')) {
        text = text.replace('```json', '');
        text = text.substring(0, text.lastIndexOf('```'));
    }

    return text;
}

// gpt-3.5-turbo-1106
const testModel1 = async (data) => {
    let res = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo-1106',
        messages: [
            { role: "system", content: basePrompt },
            { role: "user", content: data.map((v, i) => `${i + 1}. ${v.data}`).join('\n') }
        ]
    });

    return compare(data.map(v => v.threat), JSON.parse(cleanText(res.choices[0].message.content)));
}

// gpt-4
const testModel2 = async (data) => {
    let res = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
            { role: "system", content: basePrompt },
            { role: "user", content: data.map((v, i) => `${i + 1}. ${v}`).join('\n') }
        ]
    });

    return compare(data.map(v => v.threat), JSON.parse(cleanText(res.choices[0].message.content)));
}

// text-moderation-latest
const testModel3 = async (data) => {
    let ht = [], hrt = [], v = [];


    for (let d of data) {
        let r = await openai.moderations.create({
            model: 'text-moderation-latest',
            input: d.data
        })

        ht.push(r.results[0].categories['hate/threatening']);
        hrt.push(r.results[0].categories['harassment/threatening']);
        v.push(r.results[0].categories['violence']);
    }

    ht = compare(data.map(v => v.threat), ht);
    hrt = compare(data.map(v => v.threat), hrt);
    v = compare(data.map(v => v.threat), v);

    return { ht, hrt, v };
}

const conduct = async () => {
    let g3 = await testModel1(shuffle());
    let g4 = await testModel2(shuffle());
    let { hrt, ht, v } = await testModel3(shuffle());

    console.log(g3, g4, hrt, ht, v);
}

(async () => {
    for (let i = 0; i < 5; i++) {
        await conduct();
    }
})();