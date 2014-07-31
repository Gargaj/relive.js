<?
// warning, use only if crossdomain is blocked
header("Content-type: application/octet-stream");
echo file_get_contents( $_GET["url"] );
?>