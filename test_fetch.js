const url = 'https://forms.cloud.microsoft/r/JQF2zmfDWX';

async function testFetch() {
  const resp = await fetch(url);
  const html = await resp.text();
  
  const match = /"prefetchFormUrl"\s*:\s*"([^"]+)"/.exec(html);
  if (match) {
    let apiUrl = match[1].replace(/\\u0026/g, '&').replace(/\\u0027/g, "'");
    console.log('Original API URL:', apiUrl);
    
    // Try to replace runtimeFormsWithResponses with runtimeForms
    apiUrl = apiUrl.replace('runtimeFormsWithResponses', 'runtimeForms');
    console.log('Modified API URL:', apiUrl);
    
    const apiResp = await fetch(apiUrl);
    const apiJson = await apiResp.json();
    console.log('Questions found:', apiJson.questions ? apiJson.questions.length : 0);
    if(apiJson.questions && apiJson.questions.length > 0) {
      console.log('Success! Q1:', apiJson.questions[0].title);
    }
  }
}

testFetch();
