function dropHandler(evt) {
    const dT = new DataTransfer();
    if (evt.dataTransfer.files[0].name.endsWith(".zip")) {
        dT.items.add(evt.dataTransfer.files[0]);
        document.querySelector("#fileUpload").files = dT.files;
    }
    evt.preventDefault();
}

function dragOverHandler(ev) {
    ev.preventDefault();
}
