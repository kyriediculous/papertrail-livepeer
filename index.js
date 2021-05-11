const fetch = require('node-fetch')
const URL = require('url').URL
const UrlSearchParams = require('url').URLSearchParams
const fs = require('fs')

const token = process.env.PAPERTRAIL_TOKEN

const region = process.env.REGION

const queryToParams = (query) => {
    return new UrlSearchParams({
        q: query
    })
}

const getLogs = async (query) => {
    return new Promise(async (resolve, reject) => {
        try {
            const url = new URL("https://papertrailapp.com/api/v1/events/search.json")
            url.search = queryToParams(query).toString()
            const res = await fetch(url, {
                headers: {
                    'X-Papertrail-Token': token
                }
            })
            const resJson = await res.json()
            resolve(resJson)
        } catch (e) {
            reject(e)
        }
    })
}

(async () => {

    const segsUploadedResults = {};
    let segsUploadedLastSeenID = 0

    const numOrchsResults = []
    let numOrchsLastSeenID = 0

    const numRetriesResult = {}
    let numRetriesLastSeenID = 0

    const refreshCountResult = {}
    let refreshCountLastSeenID = 0 

    const maxRetriesResult = {}
    let maxRetriesLastSeenID = 0

    const getData = async () => {
        const segsUploaded = await getLogs(`${region}-prod-livepeer-secondary-broadcaster Uploaded segment`)
        const numOrchs = await getLogs(`${region}-prod-livepeer-secondary-broadcaster Done fetching orch info`)
        const refreshCount = await getLogs(`${region}-prod-livepeer-secondary-broadcaster Starting session refresh`)
        const maxTranscodeRetries = await getLogs(`${region}-prod-livepeer-secondary-broadcaster Hit max transcode`)
        const numRetries = await getLogs(`${region}-prod-livepeer-secondary-broadcaster Trying to transcode segment`)

        for (const log of segsUploaded.events) {
            if (parseInt(log.id, 10) <= segsUploadedLastSeenID) continue;
            const validHost = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/g;
            const label = log.message.match(validHost)
            if (label) {
                host = label[0]
                segsUploadedResults[host] = 1 + (segsUploadedResults[host] || 0);
                segsUploadedLastSeenID = parseInt(log.id, 10)
            }
        }
    
        for (const log of numOrchs.events) {
            if (parseInt(log.id, 10) <= numOrchsLastSeenID) continue;
            const label = log.message.match(/(numOrch=\w)/g)
            if (label) {
                numOrchsResults.push(parseInt(label[0].slice(8), 10))
                numOrchsLastSeenID = parseInt(log.id, 10)
            }
        }
    
        for (const log of refreshCount.events) {
            if (parseInt(log.id, 10) <= refreshCountLastSeenID) continue;
            const label = log.message.match(/(manifestID=([\w\-]+))/g)
            if (label) {
                const key = label[0].slice(11)
                refreshCountResult[key] = 1 + (refreshCountResult[key] || 0);
                refreshCountLastSeenID = parseInt(log.id, 10)
            }
        }
    
        for (const log of maxTranscodeRetries.events) {
            if (parseInt(log.id, 10) <= maxRetriesLastSeenID) continue;
            const label = log.message.match(/(manifestID=([\w\-]+))/g)
            if (label) {
                const key = label[0].slice(11)
                maxRetriesResult[key] = 1 + (maxRetriesResult[key] || 0);
                maxRetriesLastSeenID = parseInt(log.id, 10)
            }
        }
    
        for (const log of numRetries.events) {
            if (parseInt(log.id, 10) <= numRetriesLastSeenID) continue;
            const label = log.message.match(/(manifestID=([\w\-]+))/g)
            if (label) {
                const key = label[0].slice(11)
                numRetriesResult[key] = 1 + (numRetriesResult[key] || 0);
                numRetriesLastSeenID = parseInt(log.id, 10)
            }
        }
    }

    let hour = 1
    const maxDuration = process.env.DURATION || 24
    const intervalDur = process.env.INTERVAL || 3600000

    const processResult = () => {
        const res = {
            segsUpload: segsUploadedResults,
            numOrchs: numOrchsResults,
            numRetries: numRetriesResult,
            refreshCount: refreshCountResult,
            maxRetries: maxRetriesResult
        }
        const resString = JSON.stringify(res, null, 2)
        console.log(
            resString
        )
        fs.writeFileSync(`${region}_results.json`, resString)
    }

    await getData()

    const interval = setInterval(async () => {
        console.log(`fetching stats ${hour}/${maxDuration}`)

        if (hour >= maxDuration) {
            clearInterval(interval)
            processResult()
            return
        }

        await getData()
        hour++
    }, intervalDur)
    
})()