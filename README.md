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