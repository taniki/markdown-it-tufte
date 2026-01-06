(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
    typeof define === 'function' && define.amd ? define(factory) :
    (global = typeof globalThis !== 'undefined' ? globalThis : global || self, global.markdownitTufte = factory());
})(this, (function () { 'use strict';

    // ^^new thought^^
    //
    // Insert each marker as a separate text token, and add it to delimiter list
    //
    function newthought_tokenize(state, silent) {
        const start = state.pos;
        const marker = state.src.charCodeAt(start);
        if (silent) {
            return false;
        }
        if (marker !== 0x5e /* ^ */) {
            return false;
        }
        const scanned = state.scanDelims(state.pos, true);
        let len = scanned.length;
        const ch = String.fromCharCode(marker);
        if (len < 2) {
            return false;
        }
        let token;
        if (len % 2) {
            token = state.push("text", "", 0);
            token.content = ch;
            len--;
        }
        for (let i = 0; i < len; i += 2) {
            token = state.push("text", "", 0);
            token.content = ch + ch;
            state.delimiters.push({
                marker,
                length: 0,
                token: state.tokens.length - 1,
                end: -1,
                open: scanned.can_open,
                close: scanned.can_close,
                jump: 0
            });
        }
        state.pos += scanned.length;
        return true;
    }
    function postProcess(state, delimiters) {
        let token;
        const loneMarkers = [];
        const max = delimiters.length;
        for (let i = 0; i < max; i++) {
            const startDelim = delimiters[i];
            if (startDelim.marker !== 0x5e /* ^ */) {
                continue;
            }
            if (startDelim.end === -1) {
                continue;
            }
            const endDelim = delimiters[startDelim.end];
            token = state.tokens[startDelim.token];
            token.type = "newthought_open";
            token.tag = "span";
            token.nesting = 1;
            token.markup = "^^";
            token.content = "";
            token.attrSet("class", "newthought");
            token = state.tokens[endDelim.token];
            token.type = "newthought_close";
            token.tag = "span";
            token.nesting = -1;
            token.markup = "^^";
            token.content = "";
            if (state.tokens[endDelim.token - 1].type === "text" &&
                state.tokens[endDelim.token - 1].content === "^") {
                loneMarkers.push(endDelim.token - 1);
            }
        }
        // If a marker sequence has an odd number of characters, it is split
        // like this: `^^^^^` -> `^` + `^^` + `^^`, leaving one marker at the
        // start of the sequence.
        //
        // So, we have to move all those markers after subsequent closing tags.
        //
        while (loneMarkers.length) {
            const i = loneMarkers.pop() || 0;
            let j = i + 1;
            while (j < state.tokens.length && state.tokens[j].type === "newthought_close") {
                j++;
            }
            j--;
            if (i !== j) {
                token = state.tokens[j];
                state.tokens[j] = state.tokens[i];
                state.tokens[i] = token;
            }
        }
    }
    // Walk through delimiter list and replace text tokens with tags
    //
    function newthought_postProcess(state) {
        var _a, _b;
        const tokens_meta = state.tokens_meta;
        const max = state.tokens_meta.length;
        postProcess(state, state.delimiters);
        for (let curr = 0; curr < max; curr++) {
            if ((_a = tokens_meta[curr]) === null || _a === undefined ? undefined : _a.delimiters) {
                postProcess(state, ((_b = tokens_meta[curr]) === null || _b === undefined ? undefined : _b.delimiters) || []);
            }
        }
        // post-process return value is unused
        return false;
    }
    /**
     * Adds "newthought" spans to inline sequences delimited with ^
     */
    function doublethought_plugin(md) {
        md.inline.ruler.after("emphasis", "newthought", newthought_tokenize);
        md.inline.ruler2.after("emphasis", "newthought", newthought_postProcess);
    }

    /*
     * Sidenotes are managed using three rules:
     *
     * - footnote_def: block rule. Identifies footnote definitions, tokenizes their
     * bodies (stripping p tags and replacing with br), and stores them in state.env
     * for retrieval later.
     *
     * - footnote_ref: inline rule. Identifies footnote references, and adds a
     * placeholder token with the label and any definition tokens retrieved in the
     * footnote_def rule.
     *
     * - footnote_tail: core rule (post inline). The `sidenote_ref` placeholder
     * tokens only appear as children of `inline` tokens. Find each of these
     * placeholders, and split the parent `inline` token so that the placeholder
     * sits at the top level of the token array. Then, splice the footnote
     * definition into the token array immediately after the ref placeholder.
     *
     * Additionally, a renderer for the `sidenote_ref` token adds the appropriate
     * markup for the label/checkbox-input toggle.
     */
    function render_sidenote_ref(tokens, idx) {
        const { label, margin } = tokens[idx].meta;
        if (margin) {
            return `<label for="mn-${label}" class="margin-toggle">&#8853;</label><input id="mn-${label}" type="checkbox" class="margin-toggle">`;
        }
        return `<label for="sn-${label}" class="margin-toggle sidenote-number"></label><input id="sn-${label}" type="checkbox" class="margin-toggle">`;
    }
    function footnote_plugin$1(md) {
        md.renderer.rules.sidenote_ref = render_sidenote_ref;
        md.renderer.rules.margin_marker = md.renderer.rules.text;
        // Process footnote block definition
        function footnote_def(state, startLine, endLine, silent) {
            // ################
            // ### IDENTIFY ###
            // ################
            var _a;
            const start = state.bMarks[startLine] + state.tShift[startLine];
            const max = state.eMarks[startLine];
            // line should be at least 5 chars - "[^x]:"
            if (start + 4 > max)
                return false;
            if (state.src.charCodeAt(start) !== 0x5b /* [ */)
                return false;
            if (state.src.charCodeAt(start + 1) !== 0x5e /* ^ */)
                return false;
            let pos;
            for (pos = start + 2; pos < max; pos++) {
                if (state.src.charCodeAt(pos) === 0x20)
                    return false;
                if (state.src.charCodeAt(pos) === 0x5d /* ] */) {
                    break;
                }
            }
            if (pos === start + 2)
                return false; // no empty footnote labels
            if (pos + 1 >= max || state.src.charCodeAt(++pos) !== 0x3a /* : */)
                return false;
            if (silent)
                return true;
            pos++;
            // #############
            // ### STORE ###
            // #############
            if (!state.env.footnotes)
                state.env.footnotes = {};
            if (!state.env.footnotes.defs)
                state.env.footnotes.defs = {};
            const label = state.src.slice(start + 2, pos - 2);
            // #############
            // ### PARSE ###
            // #############
            // Set the indent to "inside" the footnote, and tokenize subsequent blocks
            // that fall within that indent.
            const oldBMark = state.bMarks[startLine];
            const oldTShift = state.tShift[startLine];
            const oldSCount = state.sCount[startLine];
            const oldLength = state.tokens.length;
            const posAfterColon = pos;
            const initial = state.sCount[startLine] +
                pos -
                (state.bMarks[startLine] + state.tShift[startLine]);
            let offset = initial;
            while (pos < max) {
                const ch = state.src.charCodeAt(pos);
                if (md.utils.isSpace(ch)) {
                    if (ch === 0x09) {
                        offset += 4 - (offset % 4);
                    }
                    else {
                        offset++;
                    }
                }
                else {
                    break;
                }
                pos++;
            }
            state.tShift[startLine] = pos - posAfterColon;
            state.sCount[startLine] = offset - initial;
            state.bMarks[startLine] = posAfterColon;
            state.blkIndent += 4;
            if (state.sCount[startLine] < state.blkIndent) {
                state.sCount[startLine] += state.blkIndent;
            }
            state.md.block.tokenize(state, startLine, endLine);
            const footnoteTokens = state.tokens.splice(oldLength - state.tokens.length);
            let hadOpeningP = false;
            for (let i = footnoteTokens.length - 1; i >= 0; i--) {
                const token = footnoteTokens[i];
                if (token.tag === "p") {
                    const insert = hadOpeningP && token.type === "paragraph_close"
                        ? [new state.Token("hardbreak", "br", 0)]
                        : [];
                    footnoteTokens.splice(i, 1, ...insert);
                }
                hadOpeningP = token.type === "paragraph_open";
                if (token.type === "inline") {
                    token.children || (token.children = []);
                    state.md.inline.parse(token.content, state.md, state.env, token.children);
                }
            }
            let margin = false;
            if (((_a = footnoteTokens[0].children) === null || _a === undefined ? undefined : _a[0].type) === "margin_marker") {
                margin = true;
                footnoteTokens[0].children.shift();
            }
            state.env.footnotes.defs[`:${label}`] = {
                tokens: footnoteTokens,
                margin
            };
            state.blkIndent -= 4;
            state.tShift[startLine] = oldTShift;
            state.sCount[startLine] = oldSCount;
            state.bMarks[startLine] = oldBMark;
            return true;
        }
        function footnote_ref(state, silent) {
            const max = state.posMax;
            const start = state.pos;
            // should be at least 4 chars - "[^x]"
            if (start + 3 > max)
                return false;
            if (!state.env.footnotes || !state.env.footnotes.defs)
                return false;
            if (state.src.charCodeAt(start) !== 0x5b /* [ */)
                return false;
            if (state.src.charCodeAt(start + 1) !== 0x5e /* ^ */)
                return false;
            let pos;
            for (pos = start + 2; pos < max; pos++) {
                if (state.src.charCodeAt(pos) === 0x20)
                    return false;
                if (state.src.charCodeAt(pos) === 0x0a)
                    return false;
                if (state.src.charCodeAt(pos) === 0x5d /* ] */) {
                    break;
                }
            }
            if (pos === start + 2)
                return false; // no empty footnote labels
            if (pos >= max)
                return false;
            pos++;
            const label = state.src.slice(start + 2, pos - 1);
            if (typeof state.env.footnotes.defs[`:${label}`] === "undefined")
                return false;
            if (!silent) {
                const token = state.push("sidenote_ref", "", 0);
                const { tokens, margin } = state.env.footnotes.defs[`:${label}`];
                token.meta = { blocks: tokens, label, margin };
            }
            state.pos = pos;
            return true;
        }
        function footnote_ref_inline(state, silent) {
            const max = state.posMax;
            const start = state.pos;
            // should be at least 4 chars - "^[x]"
            if (start + 3 > max)
                return false;
            if (state.src.charCodeAt(start) !== 0x5e /* ^ */)
                return false;
            if (state.src.charCodeAt(start + 1) !== 0x5b /* [ */)
                return false;
            const labelStart = start + 2;
            const labelEnd = md.helpers.parseLinkLabel(state, start + 1);
            // parser failed to find ']', so it's not a valid note
            if (labelEnd < 0)
                return false;
            if (!silent) {
                if (!state.env.footnotes)
                    state.env.footnotes = {};
                if (!state.env.footnotes.defs)
                    state.env.footnotes.defs = {};
                const label = Object.keys(state.env.footnotes.defs).length;
                const inline = new state.Token("inline", "", 0);
                inline.content = state.src.slice(labelStart, labelEnd).trim();
                inline.children = [];
                const tokens = [inline];
                state.md.inline.parse(inline.content, state.md, state.env, inline.children);
                const margin = inline.children[0].type === "margin_marker";
                if (margin)
                    inline.children.shift();
                // We only add this to "defs" to maintain the appropriate footnote count.
                // The pointers to data are just for code consistency.
                state.env.footnotes.defs[`:${label}`] = { tokens, margin };
                const token = state.push("sidenote_ref", "", 0);
                token.meta = { blocks: tokens, label, margin };
            }
            state.pos = labelEnd + 1;
            return true;
        }
        const MARGIN_RE = /^\{-\}\s*/;
        function margin_marker(state, silent) {
            const match = state.src.slice(state.pos).match(MARGIN_RE);
            if (match) {
                if (!silent) {
                    const token = state.push("margin_marker", "", 0);
                    token.content = match[0];
                }
                state.pos += match[0].length;
                return true;
            }
            return false;
        }
        function footnote_tail(state) {
            const { tokens } = state;
            // Iterate backwards because we will be inserting blocks
            for (let i = tokens.length - 1; i >= 0; i--) {
                const token = tokens[i];
                if (token.type === "inline" && token.children) {
                    const expandedTokens = [];
                    let refIdx;
                    while ((refIdx = token.children.findIndex(token => token.type === "sidenote_ref")) >
                        0) {
                        const refToken = token.children[refIdx];
                        const { blocks, margin } = refToken.meta;
                        const newInline = new state.Token("inline", "", 0);
                        newInline.children = token.children.splice(0, refIdx + 1);
                        const openSpan = new state.Token("span_open", "span", 1);
                        openSpan.attrSet("class", margin ? "marginnote" : "sidenote");
                        expandedTokens.push(newInline);
                        expandedTokens.push(openSpan);
                        expandedTokens.push(...blocks);
                        expandedTokens.push(new state.Token("span_close", "span", -1));
                    }
                    expandedTokens.push(token);
                    if (expandedTokens.length > 1)
                        tokens.splice(i, 1, ...expandedTokens);
                }
            }
        }
        md.block.ruler.before("reference", "footnote_def", footnote_def);
        md.inline.ruler.after("image", "footnote_ref", footnote_ref);
        md.inline.ruler.after("footnote_ref", "footnote_ref_inline", footnote_ref_inline);
        md.inline.ruler.after("footnote_ref_inline", "margin_marker", margin_marker);
        md.core.ruler.after("inline", "footnote_tail", footnote_tail);
    }

    const slugify = (s) => encodeURIComponent(String(s).trim().toLowerCase().replace(/\s+/g, "-"));
    function getTokensText(tokens) {
        return tokens
            .filter(t => ["text", "code_inline"].includes(t.type))
            .map(t => t.content)
            .join("");
    }
    function getSectionPair(state) {
        const open = new state.Token("section_open", "section", 1);
        open.block = true;
        const close = new state.Token("section_close", "section", -1);
        close.block = true;
        return { open, close };
    }
    function sectionize(state) {
        var _a, _b, _c;
        const slugs = {};
        const toProcess = [];
        if (state.tokens.length === 0)
            return;
        // Iterate backwards since we're splicing elements into the array
        for (let i = state.tokens.length - 1; i >= 0; i--) {
            const token = state.tokens[i];
            if (token.type === "heading_open" && token.tag === "h2") {
                const slug = slugify(getTokensText(state.tokens[i + 1].children || []));
                const { open, close } = getSectionPair(state);
                const divOpen = new state.Token("heading_open", "div", 1);
                divOpen.block = true;
                divOpen.attrSet("class", "section-link");
                const divClose = new state.Token("heading_close", "div", -1);
                divClose.block = true;
                const anchorOpen = new state.Token("section_anchor_open", "a", 1);
                anchorOpen.attrSet("class", "no-tufte-underline");
                const anchorClose = new state.Token("section_anchor_close", "a", -1);
                toProcess.unshift({
                    slug,
                    anchor: anchorOpen,
                    target: token
                });
                let j;
                for (j = i; j < state.tokens.length; j++) {
                    const { type, tag } = state.tokens[j];
                    if (type === "heading_close" && tag === "h2")
                        break;
                }
                state.tokens.splice(j + 1, 0, divClose);
                state.tokens.splice(i, 0, close, open, divOpen, anchorOpen, anchorClose);
            }
            else if (token.type === "paragraph_open") {
                const inline = state.tokens[i + 1];
                if (inline.type === "inline") {
                    const firstChild = (_a = inline.children) === null || _a === undefined ? undefined : _a[0];
                    if ((firstChild === null || firstChild === undefined ? undefined : firstChild.type) === "newthought_open") {
                        const { open, close } = getSectionPair(state);
                        state.tokens.splice(i, 0, close, open);
                        const newThoughtTokens = ((_b = inline.children) === null || _b === undefined ? undefined : _b.slice(1, inline.children.findIndex(({ type }) => type === "newthought_close"))) || [];
                        const slug = slugify(getTokensText(newThoughtTokens));
                        const anchorOpen = new state.Token("section_anchor_open", "a", 1);
                        anchorOpen.attrSet("class", "no-tufte-underline");
                        const anchorClose = new state.Token("section_anchor_close", "a", -1);
                        toProcess.unshift({
                            slug,
                            anchor: anchorOpen,
                            target: firstChild
                        });
                        (_c = inline.children) === null || _c === undefined ? undefined : _c.splice(1, 0, anchorOpen, anchorClose);
                    }
                }
            }
        }
        for (const data of toProcess) {
            const slugBase = data.slug;
            let slug = slugBase;
            let count = 0;
            while (slugs[slug]) {
                slug = `${slugBase}-${++count}`;
            }
            slugs[slug] = true;
            data.anchor.attrSet("href", `#${slug}`);
            data.target.attrSet("id", slug);
        }
        if (state.tokens[0].type === "section_close") {
            state.tokens.push(state.tokens.shift());
        }
        else {
            const { open, close } = getSectionPair(state);
            state.tokens.unshift(open);
            state.tokens.push(close);
        }
    }
    function footnote_plugin(md) {
        // Run after absolutely everything else. This increments the nesting level for all of the content within.
        md.core.ruler.push("sectionize", sectionize);
    }

    /*
     * Inspired by Alexs7zzh on Github
     * https://gist.github.com/Alexs7zzh/d92ae991ad05ed585d072074ea527b5c
     */
    const arrayReplaceAt = (src, pos, newElements) => {
        return [].concat(src.slice(0, pos), newElements, src.slice(pos + 1));
    };
    function figure_plugin(md) {
        const figure_def = (state) => {
            var _a, _b, _c;
            for (let idx = state.tokens.length - 1; idx >= 0; idx--) {
                const token = state.tokens[idx];
                if (token.type !== "inline")
                    continue;
                if (((_a = token.children) === null || _a === undefined ? undefined : _a.length) !== 1)
                    continue;
                if (token.children[0].type !== "image")
                    continue;
                if (state.tokens[idx + 1].type !== "paragraph_close")
                    continue;
                if (state.tokens[idx - 1].type !== "paragraph_open")
                    continue;
                state.tokens[idx + 1] = new state.Token("figure_close", "figure", -1);
                state.tokens[idx + 1].block = true;
                state.tokens[idx - 1] = new state.Token("figure_open", "figure", 1);
                state.tokens[idx - 1].block = true;
                state.tokens[idx - 1].attrs =
                    ((_b = token.children[0].attrs) === null || _b === undefined ? undefined : _b.filter(([name]) => !["src", "alt", "title"].includes(name))) || null;
                token.children[0].attrs =
                    ((_c = token.children[0].attrs) === null || _c === undefined ? undefined : _c.filter(([name]) => ["src", "alt", "title"].includes(name))) || null;
                const img = token.children[0], caption = img.attrGet("title");
                if (!caption)
                    continue;
                const inline = new state.Token("inline", "", 0);
                inline.content = caption;
                inline.block = true;
                const text = new state.Token("text", "", 0);
                text.content = caption;
                inline.children = [text];
                const figcaption_open = new state.Token("figcaption_open", "figcaption", 1);
                figcaption_open.block = true;
                const figcaption_close = new state.Token("figcaption_close", "figcaption", -1);
                figcaption_close.block = true;
                state.tokens = arrayReplaceAt(state.tokens, idx, [
                    img,
                    figcaption_open,
                    inline,
                    figcaption_close
                ]);
            }
        };
        // markdown-it-attrs injects itself before linkify
        md.core.ruler.after("linkify", "figure", figure_def);
    }

    function plugin(md) {
        doublethought_plugin(md);
        footnote_plugin$1(md);
        footnote_plugin(md);
        figure_plugin(md);
    }

    return plugin;

}));
//# sourceMappingURL=index.umd.js.map
