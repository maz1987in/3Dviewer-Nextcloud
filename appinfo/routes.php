<?php
/**
 * Routes for threedviewer app
 */

return [
	'routes' => [
		// Slicer routes
		['name' => 'slicer#test', 'url' => '/api/slicer/test', 'verb' => 'GET'],
		['name' => 'slicer#saveTempFile', 'url' => '/api/slicer/temp', 'verb' => 'POST'],
		['name' => 'slicer#getTempFile', 'url' => '/api/slicer/temp/{fileId}', 'verb' => 'GET'],
		['name' => 'slicer#deleteTempFile', 'url' => '/api/slicer/temp/{fileId}', 'verb' => 'DELETE'],
	]
];

