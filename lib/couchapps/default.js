module.exports = {
    _attachments: [],
    
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
            var fields = doc._id.split('::'),
                body = {
                    type: fields.length > 1 ? fields[0] : '',
                    id: doc.id,
                    name: doc.name
                };
                
            if (doc.pos) {
                body.lat = doc.pos.lat;
                body.lon = doc.pos.lon;
            } // if
            
            return {
                headers: {
                    "Content-Type" : "application/json"
                },
                
                body: JSON.stringify(body)
            };
        }
    },
    
    schema: {
        version: 0.1
    }
};