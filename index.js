var querystring = require('querystring');

var got = require('got');

var languages = require('./languages');

function extract(key, res) {
    var re = new RegExp(`"${key}":".*?"`);
    var result = re.exec(res.body);
    if (result !== null) {
        return result[0].replace(`"${key}":"`, '').slice(0, -1);
    }
    return '';
}

function translate(text, opts, gotopts) {
    opts = opts || {};
    gotopts = gotopts || {};
    var e;
    [opts.from, opts.to].forEach(function (lang) {
        if (lang && !languages.isSupported(lang)) {
            e = new Error();
            e.code = 400;
            e.message = 'The language \'' + lang + '\' is not supported';
        }
    });
    if (e) {
        return new Promise(function (resolve, reject) {
            reject(e);
        });
    }

    opts.from = opts.from || 'auto';
    opts.to = opts.to || 'en';
    opts.tld = opts.tld || 'com';

    opts.from = languages.getCode(opts.from);
    opts.to = languages.getCode(opts.to);

    var url = 'https://translate.google.' + opts.tld;
    return got(url, gotopts).then(function (res) {
        var data = {
            'rpcids': 'MkEWBc',
            'f.sid': extract('FdrFJe', res),
            'bl': extract('cfb2h', res),
            'hl': 'en-US',
            'soc-app': 1,
            'soc-platform': 1,
            'soc-device': 1,
            '_reqid': Math.floor(1000 + (Math.random() * 9000)),
            'rt': 'c'
        };

        return data;
    }).then(function (data) {
        url = url + '/_/TranslateWebserverUi/data/batchexecute?' + querystring.stringify(data);
        gotopts.body = 'f.req=' + encodeURIComponent(JSON.stringify([[['MkEWBc', JSON.stringify([[text, opts.from, opts.to, true], [null]]), null, 'generic']]])) + '&';
        gotopts.headers['content-type'] = 'application/x-www-form-urlencoded;charset=UTF-8';

        return got.post(url, gotopts).then(function (res) {
            var json = res.body.slice(6);
            var length = '';

            var result = {
                text: '',
                pronunciation: '',
                from: {
                    language: {
                        didYouMean: false,
                        iso: ''
                    },
                    text: {
                        autoCorrected: false,
                        value: '',
                        didYouMean: false
                    }
                },
                raw: ''
            };

            try {
                length = /^\d+/.exec(json)[0];
                json = JSON.parse(json.slice(length.length, parseInt(length, 10) + length.length));
                json = JSON.parse(json[0][2]);
                result.raw = json;
            } catch (e) {
                return result;
            }

            json[1][0][0][5].forEach(function (obj) {
                if (obj[0]) {
                    result.text += obj[0];
                }
            });
            result.pronunciation = json[1][0][0][1];

            // From language
            if (json[0][1] && json[0][1][1]) {
                result.from.language.didYouMean = true;
                result.from.language.iso = json[0][1][1][0];
            } else if (json[1][3] === 'auto') {
                result.from.language.iso = json[2];
            } else {
                result.from.language.iso = json[1][3];
            }

            // Did you mean & autocorrect
            if (json[0][1] && json[0][1][0]) {
                var str = json[0][1][0][0][1];

                str = str.replace(/<b>(<i>)?/g, '[');
                str = str.replace(/(<\/i>)?<\/b>/g, ']');

                result.from.text.value = str;

                console.log(json[0][1][0][2]);
                if (json[0][1][0][2] === 1) {
                    result.from.text.autoCorrected = true;
                } else {
                    result.from.text.didYouMean = true;
                }
            }

            return result;
        }).catch(function (err) {
            err.message += `\nUrl: ${url}`;
            if (err.statusCode !== undefined && err.statusCode !== 200) {
                err.code = 'BAD_REQUEST';
            } else {
                err.code = 'BAD_NETWORK';
            }
            throw err;
        });
    });

    /*
    return token.get(text, {tld: opts.tld}).then(function (token) {
        var url = 'https://translate.google.' + opts.tld + '/translate_a/single';
        var data = {
            client: opts.client || 't',
            sl: opts.from,
            tl: opts.to,
            hl: opts.to,
            dt: ['at', 'bd', 'ex', 'ld', 'md', 'qca', 'rw', 'rm', 'ss', 't'],
            ie: 'UTF-8',
            oe: 'UTF-8',
            otf: 1,
            ssel: 0,
            tsel: 0,
            kc: 7,
            q: text
        };
        data[token.name] = token.value;

        return url + '?' + querystring.stringify(data);
    }).then(function (url) {
        return got(url, gotopts).then(function (res) {
            var result = {
                text: '',
                pronunciation: '',
                from: {
                    language: {
                        didYouMean: false,
                        iso: ''
                    },
                    text: {
                        autoCorrected: false,
                        value: '',
                        didYouMean: false
                    }
                },
                raw: ''
            };

            if (opts.raw) {
                result.raw = res.body;
            }

            var body = JSON.parse(res.body);
            body[0].forEach(function (obj) {
                if (obj[0]) {
                    result.text += obj[0];
                }
                if (obj[2]) {
                    result.pronunciation += obj[2];
                }
            });

            if (body[2] === body[8][0][0]) {
                result.from.language.iso = body[2];
            } else {
                result.from.language.didYouMean = true;
                result.from.language.iso = body[8][0][0];
            }

            if (body[7] && body[7][0]) {
                var str = body[7][0];

                str = str.replace(/<b><i>/g, '[');
                str = str.replace(/<\/i><\/b>/g, ']');

                result.from.text.value = str;

                if (body[7][5] === true) {
                    result.from.text.autoCorrected = true;
                } else {
                    result.from.text.didYouMean = true;
                }
            }

            return result;
        }).catch(function (err) {
            err.message += `\nUrl: ${url}`;
            if (err.statusCode !== undefined && err.statusCode !== 200) {
                err.code = 'BAD_REQUEST';
            } else {
                err.code = 'BAD_NETWORK';
            }
            throw err;
        });
    });
    */
}

module.exports = translate;
module.exports.languages = languages;
