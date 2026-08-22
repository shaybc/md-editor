// Database connection string builders for the DevToys-style Database Connection String Builder tool.
(function(root) {
  "use strict";

  const DATABASES = Object.freeze([
    { id: "postgresql", label: "PostgreSQL", scheme: "postgresql", defaultPort: "5432" },
    { id: "mysql", label: "MySQL", scheme: "mysql", defaultPort: "3306" },
    { id: "mariadb", label: "MariaDB", scheme: "mariadb", defaultPort: "3306" },
    { id: "mongodb", label: "MongoDB", scheme: "mongodb", defaultPort: "27017" },
    { id: "redis", label: "Redis", scheme: "redis", defaultPort: "6379" },
    { id: "sqlserver", label: "SQL Server", scheme: "sqlserver", defaultPort: "1433" }
  ]);

  const DATABASE_BY_ID = new Map(DATABASES.map(function(database) {
    return [database.id, database];
  }));

  function normalizeText(value) {
    return String(value || "").trim();
  }

  function encodeConnectionPart(value) {
    return encodeURIComponent(normalizeText(value));
  }

  function getDatabaseDefinition(databaseId) {
    return DATABASE_BY_ID.get(databaseId) || DATABASES[0];
  }

  function resolvePort(database, value) {
    return normalizeText(value) || database.defaultPort;
  }

  function buildAuthority(parts) {
    const username = normalizeText(parts.username);
    const password = normalizeText(parts.password);
    const credentials = username
      ? encodeConnectionPart(username) + (password ? ":" + encodeConnectionPart(password) : "") + "@"
      : "";
    return credentials + normalizeText(parts.host || "localhost");
  }

  function buildUrlConnectionString(database, parts) {
    const host = buildAuthority(parts);
    const port = resolvePort(database, parts.port);
    const databaseName = normalizeText(parts.databaseName);
    const path = databaseName ? "/" + encodeConnectionPart(databaseName) : "";
    return `${database.scheme}://${host}${port ? ":" + port : ""}${path}`;
  }

  function buildSqlServerConnectionString(database, parts) {
    const host = normalizeText(parts.host || "localhost");
    const port = resolvePort(database, parts.port);
    const segments = [`Server=${host}${port ? "," + port : ""}`];
    const databaseName = normalizeText(parts.databaseName);
    const username = normalizeText(parts.username);
    const password = normalizeText(parts.password);
    if (databaseName) segments.push(`Database=${databaseName}`);
    if (username) segments.push(`User Id=${username}`);
    if (password) segments.push(`Password=${password}`);
    segments.push("TrustServerCertificate=True");
    return segments.join(";") + ";";
  }

  /**
   * Build a connection string from database form values.
   * @param {object} parts - User-entered connection fields.
   * @param {string} parts.database - Database provider identifier.
   * @param {string} parts.host - Server host name or address.
   * @param {string} parts.port - Optional port. The provider default is used when blank.
   * @param {string} parts.username - Optional user name.
   * @param {string} parts.password - Optional password.
   * @param {string} parts.databaseName - Optional database name.
   * @returns {object} Connection string plus normalized display details.
   */
  function buildConnectionString(parts = {}) {
    const database = getDatabaseDefinition(parts.database);
    const port = resolvePort(database, parts.port);
    const normalized = {
      database: database.id,
      label: database.label,
      scheme: database.scheme,
      host: normalizeText(parts.host || "localhost"),
      port,
      username: normalizeText(parts.username),
      password: normalizeText(parts.password),
      databaseName: normalizeText(parts.databaseName)
    };
    const connectionString = database.id === "sqlserver"
      ? buildSqlServerConnectionString(database, normalized)
      : buildUrlConnectionString(database, normalized);
    return {
      connectionString,
      details: normalized
    };
  }

  function getDefaultConnectionParts(databaseId) {
    const database = getDatabaseDefinition(databaseId);
    return {
      database: database.id,
      host: "localhost",
      port: "",
      username: "admin",
      password: "",
      databaseName: database.id === "redis" ? "0" : "mydb"
    };
  }

  /**
   * Register the database connection string codec with the app registry.
   * @param {object} app - MD-Editor application service container.
   * @returns {object} Public codec API.
   */
  function registerMarkdownViewerDatabaseConnectionStringCodec(app) {
    const api = {
      DATABASES,
      buildConnectionString,
      getDefaultConnectionParts
    };
    app?.registerModule?.("databaseConnectionStringCodec", api);
    return api;
  }

  root.registerMarkdownViewerDatabaseConnectionStringCodec = registerMarkdownViewerDatabaseConnectionStringCodec;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      DATABASES,
      buildConnectionString,
      getDefaultConnectionParts,
      registerMarkdownViewerDatabaseConnectionStringCodec
    };
  }
})(typeof window !== "undefined" ? window : globalThis);
