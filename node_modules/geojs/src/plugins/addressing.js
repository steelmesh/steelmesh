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
        
        // iterate through the arguments passed to the address and update members
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
                    // detect the country using the country regexes
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
        // iterate through the parts and check against country regexes
        for (var countryKey in countryRegexes) {
            for (var ii = parts.length; ii--; ) {
                if (countryRegexes[countryKey].test(parts[ii])) {
                    // return the country key
                    return {
                        // splice the part from the array
                        countryName: parts.splice(ii, 1)[0],
                        countryCode: countryKey
                    };
                } // if
            } // for
        } // for

        return null;
    } // extractCountry

    function extractStreetData(parts, streetRegexes) {

        // This function is used to extract from the street type match
        // index *back to* the street number and possibly unit number fields.
        // The function will start with the street type, then also grab the 
        // previous field regardless of checks.  Fields will continue to be 
        // pulled in until fields start satisfying numeric checks.  Once 
        // positive numeric checks are firing, those will be brought in as
        // building / unit numbers and once the start of the parts array is
        // reached or we fall back to non-numeric fields then the extraction
        // is stopped.
        function extractStreetParts(startIndex) {
            var index = startIndex,
                streetParts = [],
                numberParts,
                testFn = function() { return true; };

            while (index >= 0 && testFn()) {
                var alphaPart = isNaN(parseInt(parts[index], 10));

                if (streetParts.length < 2 || alphaPart) {
                    // add the current part to the street parts
                    streetParts.unshift(parts.splice(index--, 1));
                }
                else {
                    if (! numberParts) {
                        numberParts = [];
                    } // if

                    // add the current part to the building parts
                    numberParts.unshift(parts.splice(index--, 1));

                    // update the test function
                    testFn = function() {
                        var isAlpha = isNaN(parseInt(parts[index], 10));

                        // if we have building parts, then we are looking
                        // for non-alpha values, otherwise alpha
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

        // iterate over the street regexes and test them against the various parts
        for (var rgxIdx = 0; rgxIdx < streetRegexes.length; rgxIdx++) {
            for (var ii = parts.length; ii--; ) {
                // if we have a match, then process
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