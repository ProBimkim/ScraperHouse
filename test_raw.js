require('mongoose').connect('mongodb+srv://bimkiminfor_db_user:gQg4yefWGAPiyetx@cluster0.8fealwi.mongodb.net/scraper_db?appName=Cluster0').then(async () => {
  const res = await require('mongoose').connection.db.collection('scraperesults').find({jumlah_pertanyaan: {$gt: 0}}).sort({createdAt:-1}).limit(1).toArray(); 
  console.log(JSON.stringify(Object.keys(res[0].rawApiResponse), null, 2)); 
  if (res[0].rawApiResponse.value) {
     console.log('Value is array? ', Array.isArray(res[0].rawApiResponse.value));
     if(Array.isArray(res[0].rawApiResponse.value)) {
        console.log(JSON.stringify(res[0].rawApiResponse.value[0], null, 2)); 
     }
  } else {
     console.log(JSON.stringify(res[0].rawApiResponse, null, 2));
  }
  process.exit(0); 
});
