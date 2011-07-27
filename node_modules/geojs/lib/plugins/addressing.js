(function() {

    /* Address prototype */

    function Address() {
        this.building = '';
        this.number = '';
        this.street = '';
        this.regions = [];
        this.countryCode = '';
        this.countryName = '';
        this.postalCode = null;

        for (var ii = 0; ii < arguments.length; ii++) {
            for (var key in arguments[ii]) {
                this[key] = arguments[ii][key];
            } // for
        } // for
    } // Address

    Address.prototype = {
        constructor: Address,

        toString: function() {
            var output = '';

            if (this.building) {
                output += this.building + '\n';
            } // if

            output += this.number ? this.number + ' ' : '';
            output += (this.street || '') + '\n';
            output += this.regions.join(', ') + '\n';

            return output;
        }
    };

    /* locale parsers */

    var localeParsers = {
        EN: (function() {

            /* internals */

            var regexSeparator = /\,|\s|\//,
                countryRegexes = {
                    AU: /^AUSTRAL/,
                    US: /(^UNITED\sSTATES|^U\.?S\.?A?$)/
                },
                streetRegexes = [
                    (/^ST(REET)?$/),
                    (/^R(OA)?D$/),
                    (/^C(OUR)?T$/),
                    (/^AV(ENUE)?$/),
                    (/^PL(ACE)?$/),
                    (/^L(AN)?E$/)
                ];

            /* exports */

            return function(address) {
                var rawParts = removeEmptyParts(address.toUpperCase().split(regexSeparator)),
                    country = extractCountry(rawParts, countryRegexes),
                    streetData = extractStreetData(rawParts, streetRegexes);

                return new Address({
                    regions: rawParts
                }, country, streetData);
            }; // EN parser
        })()
    };

    /* internals */

    function extractCountry(parts, countryRegexes) {
        for (var countryKey in countryRegexes) {
            for (var ii = parts.length; ii--; ) {
                if (countryRegexes[countryKey].test(parts[ii])) {
                    return {
                        countryName: parts.splice(ii, 1)[0],
                        countryCode: countryKey
                    };
                } // if
            } // for
        } // for

        return null;
    } // extractCountry

    function extractStreetData(parts, streetRegexes) {

        function extractStreetParts(startIndex) {
            var index = startIndex,
                streetParts = [],
                numberParts,
                testFn = function() { return true; };

            while (index >= 0 && testFn()) {
                var alphaPart = isNaN(parseInt(parts[index], 10));

                if (streetParts.length < 2 || alphaPart) {
                    streetParts.unshift(parts.splice(index--, 1));
                }
                else {
                    if (! numberParts) {
                        numberParts = [];
                    } // if

                    numberParts.unshift(parts.splice(index--, 1));

                    testFn = function() {
                        var isAlpha = isNaN(parseInt(parts[index], 10));

                        return numberParts ? (! isAlpha) : isAlpha;
                    };
                } // if..else
            } // while

            return {
                building: index >= 0 ? parts.splice(0, index + 1).join(' ') : '',
                number: numberParts ? numberParts.join('/') : '',
                street: streetParts.join(' ')
            };
        } // startIndex

        for (var rgxIdx = 0; rgxIdx < streetRegexes.length; rgxIdx++) {
            for (var ii = parts.length; ii--; ) {
                if (streetRegexes[rgxIdx].test(parts[ii])) {
                    return extractStreetParts(ii);
                } // if
            } // for
        } // for

        return {
            building: '',
            number: '',
            street: ''
        };
    } // extractStreetData

    function removeEmptyParts(input) {
        var output = [];
        for (var ii = 0; ii < input.length; ii++) {
            if (input[ii]) {
                output[output.length] = input[ii];
            } // if
        } // for

        return output;
    } // removeEmptyParts

    /* exports */
    GeoJS.define('addressing', {
        parse: function(input, locale) {
            if (typeof input == 'string') {
                var parser = localeParsers[locale] || localeParsers.EN;

                return parser(input);
            }
            else {
                return new Address(input);
            } // if..else
        }
    });
})();
