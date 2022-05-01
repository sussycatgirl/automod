import axios from "axios";
import JSON5 from 'json5';

const EMOJI_DICT_URL = 'https://raw.githubusercontent.com/revoltchat/revite/master/src/assets/emojis.ts';

async function fetchEmojiList(): Promise<Record<string, string>> {
    const file: string = (await axios.get(EMOJI_DICT_URL)).data;
    const start = file.indexOf('...{') + 3;
    const end = file.indexOf('},') + 1;

    return JSON5.parse(file.substring(start, end).trim());
}
