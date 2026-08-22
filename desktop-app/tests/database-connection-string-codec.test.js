const assert = require("node:assert/strict");
const test = require("node:test");

const codec = require("../resources/js/tools/database-connection-string/database-connection-string-codec.js");

test("database connection string codec builds PostgreSQL URLs with default ports", () => {
  const result = codec.buildConnectionString({
    database: "postgresql",
    host: "localhost",
    port: "",
    username: "admin",
    password: "",
    databaseName: "mydb"
  });

  assert.equal(result.connectionString, "postgresql://admin@localhost:5432/mydb");
  assert.equal(result.details.scheme, "postgresql");
  assert.equal(result.details.port, "5432");
});

test("database connection string codec builds MongoDB URLs with encoded credentials", () => {
  const result = codec.buildConnectionString({
    database: "mongodb",
    host: "db.local",
    username: "admin user",
    password: "p@ss word",
    databaseName: "demo db"
  });

  assert.equal(result.connectionString, "mongodb://admin%20user:p%40ss%20word@db.local:27017/demo%20db");
});

test("database connection string codec builds SQL Server key-value strings", () => {
  const result = codec.buildConnectionString({
    database: "sqlserver",
    host: "localhost",
    port: "",
    username: "sa",
    password: "secret",
    databaseName: "mydb"
  });

  assert.equal(result.connectionString, "Server=localhost,1433;Database=mydb;User Id=sa;Password=secret;TrustServerCertificate=True;");
});
