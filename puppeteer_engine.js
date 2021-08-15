const process_api = (api, params, success, error) => {
    api = api.toLowerCase()
    let api_func = api_map[api] || null;
    if (api_func) {
        api_func(params, success, error)
    } else {
        error(new Error(`api ${api} not found`))
    }
}

const api_map = {
    hello: (params, success, error) => {
        success({
            ret: `hello  ${params.name || 'word'}!`
        })
    }
}

exports.process_api = process_api