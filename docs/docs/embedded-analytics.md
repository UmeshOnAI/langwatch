---
title: Embedded Analytics
sidebar_position: 80
---

# Export Analytics with REST Endpoint

LangWatch offers you the possibility to build and integrate LangWatch graph's on your own systems and applications, to display it to your customers in another interface.

On LangWatch dashboard, you can use our powerful custom chart builder tool, to plot any data collected and generated by LangWatch, and customize the way you want to display it. You can then use our REST API to fetch the graph data.

import { CustomRestAnalytics} from "./CustomRestAnalytics"

<CustomRestAnalytics />

## Screenshots on how to get the JSON data.

On the right menu button above the graph you will see the **Show API** menu link. Click that and a modal will then popup.

![langwatch dashboard](@site/static/img/screenshot-show-json.png)

Within this modal, you'll find the JSON payload required for the precise custom analytics data. Simply copy this payload and paste it into the body of your REST POST request.

![langwatch dashboard](@site/static/img/screenshot-json-modal.png)

Now you're fully prepared to access your customized analytics and seamlessly integrate them into your specific use cases.

If you encounter any hurdles or have questions, our support team is eager to assist you.