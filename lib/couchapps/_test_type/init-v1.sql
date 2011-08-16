DROP TABLE IF EXISTS test_type;

CREATE TABLE test_type (
    gid serial PRIMARY KEY,
    id varchar(80),
    name varchar(80),
    lat numeric,
    lon numeric
);

SELECT AddGeometryColumn('','test_type','the_geom',4326,'POINT',2);