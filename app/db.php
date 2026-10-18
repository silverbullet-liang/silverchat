<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

/** PDO 单例。所有 SQL 必须走预处理占位符。 */
function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }
    $host = (string) sc_cfg('db.host', 'localhost');
    $port = (int) sc_cfg('db.port', 3306);
    $name = (string) sc_cfg('db.name', 'silverchat');
    $charset = (string) sc_cfg('db.charset', 'utf8mb4');
    $dsn = 'mysql:host=' . $host . ';port=' . $port . ';dbname=' . $name . ';charset=' . $charset;
    $pdo = new PDO($dsn, (string) sc_cfg('db.user', ''), (string) sc_cfg('db.pass', ''), array(
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
        PDO::ATTR_STRINGIFY_FETCHES  => false,
    ));
    return $pdo;
}

function db_all(string $sql, array $params = array()): array
{
    $st = db()->prepare($sql);
    $st->execute($params);
    $rows = $st->fetchAll();
    return is_array($rows) ? $rows : array();
}

function db_one(string $sql, array $params = array())
{
    $st = db()->prepare($sql);
    $st->execute($params);
    $row = $st->fetch();
    return $row === false ? null : $row;
}

function db_val(string $sql, array $params = array())
{
    $st = db()->prepare($sql);
    $st->execute($params);
    $v = $st->fetchColumn();
    return $v === false ? null : $v;
}

function db_exec(string $sql, array $params = array()): int
{
    $st = db()->prepare($sql);
    $st->execute($params);
    return $st->rowCount();
}

function db_insert(string $sql, array $params = array()): int
{
    db_exec($sql, $params);
    return (int) db()->lastInsertId();
}

function db_tx(callable $fn)
{
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $result = $fn($pdo);
        $pdo->commit();
        return $result;
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
}

/** 判断唯一键冲突（兼容 PDO 与 MySQL 错误码）。 */
function db_is_duplicate(Exception $e): bool
{
    if ($e instanceof PDOException) {
        $info = $e->errorInfo;
        return isset($info[0]) && (string) $info[0] === '23000';
    }
    return false;
}
