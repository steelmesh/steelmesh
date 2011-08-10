module.exports = {
    views: {
        simple: {
            map: function(doc) {
                emit(doc.id, doc.name);
            }
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