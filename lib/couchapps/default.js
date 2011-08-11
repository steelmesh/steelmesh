module.exports = {
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
            return {
                headers: {
                    "Content-Type" : "application/json"
                },
                
                body: JSON.stringify({
                    id: doc.id,
                    name: doc.name
                })
            };
        }
    }
};