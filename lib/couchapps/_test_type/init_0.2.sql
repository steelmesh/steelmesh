CREATE TABLE aaat_acc (
    gid serial PRIMARY KEY,
    id varchar(80),
"name" varchar(80),
"lat" varchar(80),
"lon" varchar(80),
"category" varchar(80),
"chain" varchar(80),
"rating" varchar(80),
"greenrated" varchar(80),
"region" varchar(80),
"allowpets" varchar(80),
"gsr" varchar(80),
"gsrcount" varchar(80)
);
SELECT AddGeometryColumn('','aaat_acc','the_geom','4236','POINT',2);