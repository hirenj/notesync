# Notesync

A library for synchronisation of data from a web-based Note service (such as [OneNote](http://onenote.com)) and an `Object` containing a representation of select elements from the note service.

## Usage

You'll need to have logged in to the appropriate service, and have an Oauth token ready for use. Further, you'll need to know the identifiers for both document and element to tell the library where to get the data from.

### Getting the values for an element ID

```js
var onenote = new OneNoteSync();
onenote.setToken(ACCESS_TOKEN);
onenote.watchElement(DOC_ID,ELEMENT_ID);
onenote.sync();
var values = onenote.getValues(DOC_ID,ELEMENT_ID);
```

### Browsing tables on a page, and watching one table

```js
onenote.listTablesForPage('Notebook name','Section name','Page title').then(function(pages_with_tables) {
	pages_with_tables.forEach(function(tables) {
		tables.forEach(function(table) {

			// We have the data from the table
			console.table(table.table.data);

			// If we want to add this to our synchronisation
			// call the watch method on the table
			table.watch();
		});
	});
});
```


### Watching for changes on values

```js
onenote.notifyChanges(DOC_ID,ELEMENT_ID,function(new_values) {
    console.log(new_values);
});
```

### Shutting down and cleanup

```js
OneNoteSync.terminate().then(function() { console.log("Cleaned up") });
```