import * as zip from "https://deno.land/x/zipjs/index.js";

const base_config = [
    {
        "name": "Likes Given",
        "file": "likes.csv",
        "id": "likes",
        "group_by": "created_at",
        "total_transformer": (t) => `<span class="num">${t}</span> Likes Given`
    },
    {
        "name": "Days Visited",
        "file": "visits.csv",
        "id": "visits",
        "group_by": "visited_at",
        "total_transformer": (t) => `<span class="num">${t}</span> Days Visited`
    },
    {
        "name": "Posts",
        "file": "user_archive.csv",
        "id": "posts",
        "group_by": "created_at",
        "total_transformer": (t) => `<span class="num">${t}</span> Posts/Replies Sent`
    },
    // https://meta.discourse.org/t/what-unit-on-user-visits-time-read/238908
    // Time read appears to represent time spent purely scrolling / reading in seconds?
    {
        "name": "Time Reading",
        "file": "visits.csv",
        "id": "time_read",
        "group_by": "visited_at",
        "count": "time_read",
        "total_transformer": (t) => `<span class="num">${(t / 60 / 60).toFixed(2)}</span> Hours Reading`
    },
    {
        "name": "Posts Read",
        "file": "visits.csv",
        "id": "posts_read",
        "group_by": "visited_at",
        "count": "posts_read",
        "total_transformer": (t) => `<span class="num">${(t / 1000).toFixed(2)}k</span> Posts/Replies Read`
    },
];

let chartInstance = null;
let file = null;

let display = [];
const groups = [];
const datasets = [];

const options = {
    scales: {},
    responsive: true,
    maintainAspectRatio: false
}

const fileUpload = document.getElementById('fileUpload');

let checkboxes = document.querySelectorAll("[data-dataset-id]");
checkboxes.forEach(function (checkbox) {
    checkbox.addEventListener("change", refresh);
});

document.querySelector("#frequency").addEventListener("change", refresh);

fileUpload.addEventListener('change', (event) => {
    file = event.target.files[0];
    init();
});

function refresh() {
    groups.length = 0;
    datasets.length = 0;
    init();
}


async function init() {
    Array.from(document.querySelectorAll(".chart-container, .options, .backdrop, .best-posts-container")).map(x => x.classList.remove("d-none"));
    document.querySelector(".dropzone").classList.add("d-none");

    if (file) {
        document.querySelector(".all-time").innerHTML = "";
        display = Array.from(checkboxes).map(x => x.checked ? x.getAttribute("data-dataset-id") : null).filter(x => x !== null);

        const frequency = document.querySelector("#frequency").value;
        let setDates = false;

        const blob = file;
        const zipFileReader = new zip.BlobReader(blob);
        const zipReader = new zip.ZipReader(zipFileReader);
        const files = await zipReader.getEntries();

        const config = base_config.filter(x => display.includes(x.id)).map(x => {
            options.scales[x.id] = {
                type: 'linear',
                display: true,
                position: 'left',
                weight: base_config.filter(x => display.includes(x.id)).length - Object.keys(options.scales).length
            };
            return x;
        });

        for await (let datasetConfig of config) {
            const file = files.find(x => x.filename === datasetConfig.file)
            const fileStream = new TransformStream();
            const filePromise = new Response(fileStream.readable).text();

            await file.getData(fileStream.writable);
            await zipReader.close();

            // At first it might seem easy to parse a CSV - split by newlines then map and split by commas
            // But once CSV cells become surrounded in quotes, contain commas, .etc it becomes extremely tedious
            // So using a library to parse it
            const table = CSV.parse(await filePromise);
            const headerRow = table[0];

            table.shift();

            if (!setDates) {
                setDates = true;
                const startDate = new Date(table[0][headerRow.indexOf(datasetConfig.group_by)]);
                const endDate = new Date(table[table.length - 1][headerRow.indexOf(datasetConfig.group_by)]);
                const oneDay = 24 * 60 * 60 * 1000; // hours*minutes*seconds*milliseconds
                const totalDays = Math.ceil((endDate - startDate) / oneDay);

                for (let i = 0; i < totalDays / frequency; i++) {
                    const sectionStartDate = new Date(startDate);
                    const sectionEndDate = new Date(startDate);
                    sectionStartDate.setDate(startDate.getDate() + (frequency * i));
                    sectionEndDate.setDate(startDate.getDate() + (frequency * (i + 1)));
                    groups.push({
                        start: sectionStartDate,
                        end: sectionEndDate,
                        datasets: []
                    });
                }
            }

            const dataset = new Array(groups.length).fill(0);
            let total = 0;

            if (datasetConfig.id === "posts") {
                const sortedPosts = table
                    .slice(0) // Dont modify original array
                    .sort((a,b) => b[headerRow.indexOf("like_count")] - a[headerRow.indexOf("like_count")])
                    .slice(0, 5);

                document.querySelector(".best-posts").innerHTML += sortedPosts.map(post => `
                    <details>
                        <summary>${(new Date(post[headerRow.indexOf("created_at")])).toLocaleDateString('en-GB', {
                            day: 'numeric', month: 'short', year: 'numeric'
                        })}: ${post[headerRow.indexOf("like_count")]} Likes</summary>
                        <div class="top-post-content">
                            ${post[headerRow.indexOf("post_cooked")]}
                        </div>
                    </details>
                `).join("\n");
            }

            table.forEach(row => {
                const created_at = new Date(row[headerRow.indexOf(datasetConfig.group_by)]);
                const group = groups.find(x => x.start <= created_at && x.end > created_at);
                if (group) {
                    const group_index = groups.indexOf(group);
                    let increment = 1;

                    if (datasetConfig.count)
                        increment = Number(row[headerRow.indexOf(datasetConfig.count)]);
                    
                    dataset[group_index] = dataset[group_index] + increment;
                    total += increment;
                }
            });

            datasets.push({
                label: datasetConfig.name,
                data: dataset,
                yAxisID: datasetConfig.id,
                tension: 0.2
            });

            document.querySelector(".all-time").innerHTML += `
                <div class="stat">
                    ${datasetConfig.total_transformer(total)}
                </div>
            `;
        }

        if (chartInstance)
            chartInstance.destroy();

        chartInstance = new Chart(
            document.querySelector('#chart'),
            {
                type: 'line',
                data: {
                    labels: groups.map(group => group.start.toLocaleDateString('en-GB', {
                        day: 'numeric', month: 'short', year: 'numeric'
                    })),
                    datasets: datasets
                },
                options: options
            }
        );
    }

    document.querySelector(".backdrop").classList.add("d-none");
}