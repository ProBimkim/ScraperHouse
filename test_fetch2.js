const url = 'https://forms.cloud.microsoft/r/JQF2zmfDWX';

async function testFetch() {
  const htmlResp = await fetch(url, { redirect: 'follow' });
  const html = await htmlResp.text();
  
  const match = /"prefetchFormUrl"\s*:\s*"([^"]+)"/.exec(html);
  if (!match) return console.log('no prefetch');

  let apiUrl = match[1].replace(/\\u0026/g, '&').replace(/\\u0027/g, "'");
  console.log('Original API URL:', apiUrl);

  const apiRegex = /(https:\/\/.*?\/formapi\/api\/[^\/]+\/users\/[^\/]+)\/light\/runtimeForms(?:WithResponses)?\('([^']+)'\)/;
  const urlMatch = apiRegex.exec(apiUrl);
  
  if (urlMatch) {
    const base = urlMatch[1];
    const formId = urlMatch[2];
    console.log('Base:', base);
    console.log('Form ID:', formId);
    
    const postUrl = `${base}/forms('${formId}')/timedform/responseRecord`;
    const getUrl = `${base}/light/runtimeForms('${formId}')?$expand=questions($expand=choices)`;
    
    // Extract tokens
    const token = (/"__RequestVerificationToken"\s*:\s*"([^"]+)"/.exec(html) || [])[1];
    const correlation = (/"CorrelationId"\s*:\s*"([^"]+)"/.exec(html) || [])[1];
    const session = (/"SessionId"\s*:\s*"([^"]+)"/.exec(html) || [])[1];
    
    const headers = {
      'User-Agent': 'Mozilla/5.0',
      'Origin': 'https://forms.cloud.microsoft',
      'Referer': url,
      'Content-Type': 'application/json'
    };
    if (token) headers['__RequestVerificationToken'] = token;
    
    console.log('Posting to:', postUrl);
    const postResp = await fetch(postUrl, { method: 'POST', headers, body: JSON.stringify({}) });
    console.log('Post status:', postResp.status);
    
    console.log('Fetching:', getUrl);
    const getResp = await fetch(getUrl, { method: 'GET', headers: { ...headers, accept: 'application/json' } });
    const json = await getResp.json();
    console.log('Questions:', json.questions ? json.questions.length : 0);
  }
}

testFetch();
