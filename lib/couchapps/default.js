module.exports = {
    spatial: {
        points: function(doc) {
            if (doc.pos) {
                var fields = doc._id.split('::'),
                    item = {
                        type: fields.length > 1 ? fields[0] : '',
                        id: doc.id,
                        name: doc.name,
                        pos: doc.pos
                    };

                emit({
                    type: 'Point',
                    coordinates: [doc.pos.lon, doc.pos.lat]
                }, item);
            } // if
        }
    },

    views: {
        simple: {
            map: function(doc) {
                emit(doc.id, doc.name);
            }
        },
        
        datasets: {
            map: function(doc) {
                var fields = doc._id.split('::');

                emit(fields.length > 1 ? fields[0] : '', 1);
            },
            
            reduce: '_count'
        }
    },
    
    shows: {
        summary: function(doc, req) {
            var body = {
                id: doc.id,
                name: doc.name
            };
            
            // if this document has position information
            // then attach that
            if (doc.pos) {
                body.pos = doc.pos;
            } // if
            
            return {
                headers: {
                    "Content-Type" : "application/json"
                },
                
                body: JSON.stringify(body)
            };
        }
    }
};